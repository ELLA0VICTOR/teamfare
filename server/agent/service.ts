import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Store, UserRow } from "../store.ts";
import type { Plan } from "../../src/data.ts";
import type { ResearchInput, ResearchRun } from "../../src/research.ts";
import { costTotal } from "../../src/research.ts";
import { runResearch } from "./runner.ts";
import { agentSetup, createProviders, ProviderError } from "./providers.ts";
import type { AgentProviders } from "./providers.ts";

export class ResearchError extends Error {
  statusCode: number;
  constructor(status: number, message: string) {
    super(message);
    this.statusCode = status;
  }
}
export const researchRequest = z
  .object({
    requestId: z.uuid(),
    brief: z.string().trim().min(10).max(500),
    people: z.number().int().min(2).max(20),
    location: z.string().trim().min(2).max(100),
    date: z.iso.date(),
    perPerson: z.number().int().min(1).max(5000000),
  })
  .strict();

export class ResearchService {
  private readonly active = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  private readonly providers: AgentProviders;
  private readonly injected: boolean;
  constructor(privateStore: Store, providers?: AgentProviders) {
    this.store = privateStore;
    this.providers = providers ?? createProviders();
    this.injected = !!providers;
    const interrupted = this.store.db
      .prepare("SELECT id,data FROM research_runs WHERE status='running'")
      .all() as { id: string; data: string }[];
    for (const row of interrupted) {
      const run = JSON.parse(row.data) as ResearchRun;
      run.status = "failed";
      run.error =
        "The server restarted during research. Start a new run when ready.";
      this.save(run);
    }
  }
  private readonly store: Store;
  setup() {
    return this.injected
      ? { ready: true, provider: this.providers.label, missing: [] }
      : agentSetup();
  }
  private save(run: ResearchRun) {
    run.updatedAt = new Date().toISOString();
    this.store.db
      .prepare("UPDATE research_runs SET status=?,data=? WHERE id=?")
      .run(run.status, JSON.stringify(run), run.id);
  }
  get(id: string, user: UserRow) {
    const row = this.store.db
      .prepare(
        "SELECT data FROM research_runs WHERE id=? AND user_id=? AND team_id=?",
      )
      .get(id, user.id, user.team_id) as { data: string } | undefined;
    if (!row) throw new ResearchError(404, "Research run not found.");
    return JSON.parse(row.data) as ResearchRun;
  }
  read(id: string, user: UserRow) {
    const row = this.store.db
      .prepare(
        "SELECT user_id,data FROM research_runs WHERE id=? AND team_id=?",
      )
      .get(id, user.team_id) as { user_id: string; data: string } | undefined;
    if (!row) throw new ResearchError(404, "Research run not found.");
    const run = JSON.parse(row.data) as ResearchRun;
    if (row.user_id !== user.id && !run.selectedPlanId)
      throw new ResearchError(404, "Research run not found.");
    return run;
  }
  start(user: UserRow, raw: unknown) {
    const parsed = researchRequest.parse(raw);
    const old = this.store.db
      .prepare("SELECT id FROM research_runs WHERE user_id=? AND request_id=?")
      .get(user.id, parsed.requestId) as { id: string } | undefined;
    if (old) return this.get(old.id, user);
    const setup = this.setup();
    if (!setup.ready)
      throw new ResearchError(
        503,
        `Research is not configured. Set ${setup.missing.join(", ")} on the server.`,
      );
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (parsed.date < today)
      throw new ResearchError(
        400,
        "Choose today or a later date for research.",
      );
    const running = this.store.db
      .prepare(
        "SELECT id FROM research_runs WHERE user_id=? AND status='running'",
      )
      .get(user.id);
    if (running)
      throw new ResearchError(
        409,
        "You already have research in progress. Open it under Recent research on Home.",
      );
    if (this.active.size >= 2)
      throw new ResearchError(
        429,
        "Research is busy. Try again when a current run finishes.",
      );
    const recent = this.store.db
      .prepare(
        "SELECT COUNT(*) AS count FROM research_runs WHERE user_id=? AND created_at>=?",
      )
      .get(user.id, new Date(Date.now() - 3600000).toISOString()) as {
      count: number;
    };
    if (recent.count >= 4)
      throw new ResearchError(
        429,
        "You have reached four research runs this hour. Try again later.",
      );
    const day = new Date().toISOString().slice(0, 10) + "T00:00:00.000Z";
    const globalDaily = this.store.db
      .prepare("SELECT count(*) AS n FROM research_runs WHERE created_at>=?")
      .get(day) as { n: number };
    const teamDaily = this.store.db
      .prepare(
        "SELECT count(*) AS n FROM research_runs WHERE team_id=? AND created_at>=?",
      )
      .get(user.team_id, day) as { n: number };
    if (globalDaily.n >= 20 || teamDaily.n >= 10)
      throw new ResearchError(
        429,
        "The daily research allowance has been reached. Try again tomorrow (UTC).",
      );
    const { requestId: _requestId, ...fields } = parsed;
    const input: ResearchInput = { ...fields, preference: user.preference };
    const run: ResearchRun = {
      provider: this.providers.label,
      id: randomUUID(),
      status: "running",
      input,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      events: [],
    };
    this.store.db
      .prepare(
        "INSERT INTO research_runs(id,team_id,user_id,request_id,status,created_at,data) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        run.id,
        user.team_id,
        user.id,
        parsed.requestId,
        run.status,
        run.createdAt,
        JSON.stringify(run),
      );
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(180000),
    ]);
    const done = Promise.resolve().then(async () => {
      try {
        const result = await runResearch(
          input,
          this.providers,
          signal,
          (text) => {
            if (signal.aborted) return;
            run.events.push({ at: new Date().toISOString(), text });
            this.save(run);
          },
        );
        if (signal.aborted)
          throw new ProviderError("Research was interrupted.");
        run.result = result;
        run.status = "completed";
        this.save(run);
      } catch (error) {
        const current = this.get(run.id, user);
        if (current.status === "cancelled") return;
        run.status = "failed";
        run.error = signal.aborted
          ? "Research was interrupted or reached its three-minute time limit. Start a new run when ready."
          : error instanceof ProviderError
            ? error.message
            : "Research could not produce a valid, sourced proposal. Try a more specific brief.";
        this.save(run);
      } finally {
        this.active.delete(run.id);
      }
    });
    this.active.set(run.id, { controller, done });
    return run;
  }
  cancel(id: string, user: UserRow) {
    const run = this.get(id, user);
    if (run.status !== "running") return run;
    run.status = "cancelled";
    run.error = "Cancelled by you. Nothing was booked or saved as a plan.";
    run.events.push({
      at: new Date().toISOString(),
      text: "Research cancelled by the organiser.",
    });
    this.save(run);
    this.active.get(id)?.controller.abort();
    return run;
  }
  accept(id: string, user: UserRow, optionId: string) {
    return this.store.transaction(() => {
      const run = this.get(id, user);
      if (run.status !== "completed" || !run.result)
        throw new ResearchError(409, "Research is not complete.");
      if (run.selectedPlanId) {
        if (run.selectedOptionId !== optionId)
          throw new ResearchError(
            409,
            "This research already has a draft. Open it instead.",
          );
        const row = this.store.plan(run.selectedPlanId, user.team_id);
        if (!row)
          throw new ResearchError(404, "The draft is no longer available.");
        return { ...(JSON.parse(row.data) as Plan), revision: row.revision };
      }
      const option = run.result.options.find((item) => item.id === optionId);
      if (!option)
        throw new ResearchError(400, "Choose one of this run’s options.");
      const plan: Plan = {
        id: randomUUID(),
        experienceId: "researched",
        createdBy: user.id,
        title: option.title,
        date: run.input.date,
        time: option.itinerary[0].time,
        people: run.input.people,
        budget: run.input.perPerson * run.input.people,
        location: option.location,
        note: option.summary,
        attendees: [
          user.id,
          ...this.store
            .members(user.team_id)
            .filter((member) => member.id !== user.id)
            .map((member) => member.id),
        ].slice(0, run.input.people),
        going: [],
        declined: [],
        status: "Draft",
        revision: 1,
        emailGuests: true,
        durationMinutes: 120,
        unitPrice: costTotal(option.costs, run.input.people) / run.input.people,
        proposal: { ...option, runId: run.id },
        events: [
          {
            id: randomUUID(),
            at: new Date().toISOString(),
            text: `${user.name} saved a draft from sourced research. No booking or invitation was made.`,
          },
        ],
      };
      this.store.db
        .prepare(
          "INSERT INTO plans(id,team_id,creator_id,data) VALUES(?,?,?,?)",
        )
        .run(plan.id, user.team_id, user.id, JSON.stringify(plan));
      run.selectedPlanId = plan.id;
      run.selectedOptionId = option.id;
      this.save(run);
      return plan;
    });
  }
  async close() {
    for (const job of this.active.values()) job.controller.abort();
    await Promise.allSettled([...this.active.values()].map((job) => job.done));
  }
}
