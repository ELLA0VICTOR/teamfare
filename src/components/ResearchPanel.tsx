import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { api, ApiError } from "../api";
import { dateLabel } from "../data";
import { useCurrency } from "../currency-context";
import type { Plan } from "../data";
import { costTotal } from "../research";
import type { AgentSetup, ResearchRun } from "../research";
import type { ComposerValues } from "./Home";
import { Evidence } from "./Evidence";

export type ResearchRequest = ComposerValues & { requestId: string };
export function ResearchPanel({
  runId,
  request,
  csrf,
  onStarted,
  onSaved,
  onManual,
  onRestart,
  onExpired,
}: {
  runId?: string;
  request: ResearchRequest | null;
  csrf: string;
  onStarted: (id: string) => void;
  onSaved: (plan: Plan) => Promise<void>;
  onManual: (values: ComposerValues) => void;
  onRestart: (values: ComposerValues) => void;
  onExpired: () => void;
}) {
  const { money, text } = useCurrency();
  const [run, setRun] = useState<ResearchRun | null>(null),
    [setup, setSetup] = useState<AgentSetup | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const lifecycle = new AbortController();
    const failed = (failure: unknown) => {
      if (lifecycle.signal.aborted) return;
      if (failure instanceof ApiError && failure.status === 401) {
        onExpired();
        return;
      }
      setError(
        failure instanceof Error
          ? failure.message
          : "Research could not be loaded.",
      );
    };
    const poll = async () => {
      try {
        const latest = await api<ResearchRun>(`/research/${runId}`);
        if (lifecycle.signal.aborted) return;
        setRun((current) =>
          current?.id === latest.id &&
          current.status !== "running" &&
          latest.status === "running"
            ? current
            : latest,
        );
        setError("");
        if (latest.status === "running")
          timer.current = setTimeout(() => void poll(), 1500);
      } catch (failure) {
        failed(failure);
      }
    };
    if (runId) void poll();
    else if (request) {
      void (async () => {
        const config = await api<AgentSetup>("/research/config");
        if (lifecycle.signal.aborted) return;
        setSetup(config);
        if (!config.ready) return;
        const created = await api<ResearchRun>("/research", request, csrf);
        if (!lifecycle.signal.aborted) {
          setRun(created);
          onStarted(created.id);
        }
      })().catch(failed);
    }
    return () => {
      lifecycle.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [runId, request, csrf, onStarted, onExpired]);
  const input = run?.input ?? request;
  async function cancel() {
    if (!run) return;
    setBusy(true);
    try {
      setRun(await api<ResearchRun>(`/research/${run.id}/cancel`, {}, csrf));
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Could not cancel.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function accept(optionId: string) {
    if (!run) return;
    setBusy(true);
    setError("");
    try {
      await onSaved(
        await api<Plan>(`/research/${run.id}/accept`, { optionId }, csrf),
      );
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The draft could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="research-page">
      <a href="#home" className="back-link">
        <ArrowLeft size={16} />
        Back to Home
      </a>
      <header className="page-heading">
        <div>
          <span className="eyebrow">A plan, with the details behind it</span>
          <h1>
            {run?.status === "completed"
              ? "Find your good fit."
              : "Let’s find a good fit."}
          </h1>
          <p>Research first. Your decision next.</p>
        </div>
      </header>
      {input && (
        <div className="research-brief">
          <p>{input.brief}</p>
          <span>
            {input.people} people · {input.location} · {dateLabel(input.date)} ·{" "}
            {money(input.perPerson * input.people)} total budget
          </span>
        </div>
      )}
      {setup && !setup.ready && !run && (
        <div className="research-notice">
          <h2>Research needs a connection.</h2>
          <p>
            The model and web-search services aren’t configured on this server
            yet. You can still make an editable draft from the sample catalogue.
          </p>
          {input && (
            <button
              className="button button-outline"
              onClick={() => onManual(input)}
            >
              Make a manual draft
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      {input && !run && !error && (!setup || setup.ready) && (
        <p className="research-status" role="status">
          Starting your research…
        </p>
      )}
      {error && (
        <div className="research-notice" role="alert">
          <h2>Research needs attention.</h2>
          <p>{error}</p>
          <a
            className="button button-outline"
            href={runId ? `#research/${runId}` : "#home"}
            onClick={runId ? () => window.location.reload() : undefined}
          >
            {runId ? "Reload research" : "Back to Home"}
          </a>
        </div>
      )}
      {run && (
        <>
          <section
            className="research-progress"
            aria-labelledby="research-progress-heading"
          >
            <div className="section-heading">
              <h2 id="research-progress-heading">
                {run.status === "running"
                  ? "Research in progress"
                  : run.status === "completed"
                    ? "Research complete"
                    : run.status === "cancelled"
                      ? "Research cancelled"
                      : "Research stopped"}
              </h2>
              {run.status === "running" && (
                <button
                  className="button button-outline"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  Cancel research
                </button>
              )}
            </div>
            <p className="field-help">
              {run.provider ??
                setup?.provider ??
                "Vultr Serverless Inference + Tavily"}{" "}
              · Only completed actions appear below.
            </p>
            <ol className="research-events" aria-live="polite">
              {run.events.map((event, index) => (
                <li key={index}>
                  <Check size={15} aria-hidden="true" />
                  <span>{text(event.text)}</span>
                  <time>
                    {new Date(event.at).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </li>
              ))}
            </ol>
            {run.status === "running" && (
              <p className="research-status" role="status">
                Checking evidence and comparing options. You can leave this page
                and return from Home.
              </p>
            )}
            {run.error && <p className="form-error">{run.error}</p>}
            {["failed", "cancelled"].includes(run.status) && (
              <div className="research-actions">
                <button
                  className="button button-dark"
                  disabled={busy}
                  onClick={() => onRestart(run.input)}
                >
                  Try a new research run
                  <ArrowRight size={16} />
                </button>
                <button
                  className="button button-outline"
                  onClick={() => onManual(run.input)}
                >
                  Make a manual draft
                </button>
              </div>
            )}
          </section>
          {run.result && (
            <>
              <div className="research-summary">
                <h2>Options worth considering</h2>
                <p>{text(run.result.summary)}</p>
              </div>
              {run.selectedPlanId && (
                <div className="research-notice">
                  <p>You’ve already saved a draft from this research.</p>
                  <a
                    href={`#plan/${run.selectedPlanId}`}
                    className="button button-dark"
                  >
                    Open your draft
                    <ArrowRight size={16} />
                  </a>
                </div>
              )}
              <div className="research-options">
                {run.result.options.map((option) => {
                  const total = costTotal(option.costs, run.input.people),
                    remaining = run.input.people * run.input.perPerson - total,
                    recommended = option.id === run.result!.recommendedOptionId;
                  return (
                    <article className="research-option" key={option.id}>
                      <div className="research-option-heading">
                        <span className="eyebrow">
                          {recommended
                            ? "Recommended option"
                            : "Another good possibility"}
                        </span>
                        <h2>{option.title}</h2>
                        <p>
                          {option.venueName} · {option.location} ·{" "}
                          {option.duration}
                        </p>
                      </div>
                      <p>{text(option.summary)}</p>
                      <p className="option-reason">{text(option.reason)}</p>
                      <dl className="cost-ledger">
                        <div className="ledger-total">
                          <dt>Estimate · total</dt>
                          <dd>
                            {money(total)}
                            <small>
                              ≈ {money(total / run.input.people)} average per
                              person
                            </small>
                          </dd>
                        </div>
                        {option.costs.map((cost, index) => (
                          <div key={index}>
                            <dt>
                              {cost.label}
                              <small>
                                {money(cost.amount)}{" "}
                                {cost.unit === "fixed"
                                  ? "fixed total"
                                  : `per person × ${run.input.people}`}{" "}
                                ·{" "}
                                {cost.basis === "published"
                                  ? "published figure; confirm terms"
                                  : "estimate"}
                              </small>
                            </dt>
                            <dd>
                              {money(
                                cost.amount *
                                  (cost.unit === "per_person"
                                    ? run.input.people
                                    : 1),
                              )}{" "}
                              total
                            </dd>
                          </div>
                        ))}
                        <div className={remaining < 0 ? "error-text" : ""}>
                          <dt>
                            {remaining < 0
                              ? "Over budget"
                              : "Remaining in budget"}
                          </dt>
                          <dd>{money(Math.abs(remaining))}</dd>
                        </div>
                      </dl>
                      <div className="option-itinerary">
                        <h3>A possible itinerary</h3>
                        {option.itinerary.map((item, index) => (
                          <div key={index}>
                            <time>{item.time}</time>
                            <p>
                              <strong>{item.title}</strong>
                              <span>{text(item.details)}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="dietary-notes">
                        <strong>Dietary considerations</strong>
                        {option.dietaryNotes}
                      </p>
                      <div className="open-questions">
                        <h3>Still to confirm</h3>
                        <ul>
                          {option.openQuestions.map((question) => (
                            <li key={question}>{text(question)}</li>
                          ))}
                        </ul>
                      </div>
                      <Evidence option={option} />
                      {!run.selectedPlanId && (
                        <button
                          className={`button ${recommended ? "button-dark" : "button-outline"}`}
                          disabled={busy}
                          onClick={() => void accept(option.id)}
                        >
                          Use this plan
                          <ArrowRight size={16} />
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <p className="field-help research-limitations">
                {run.result.limitations.join(" ")}
              </p>
            </>
          )}
        </>
      )}
      {!input && !run && !error && (
        <div className="empty-state">
          <h2>Start with your idea.</h2>
          <p>Describe the outing on Home to begin research.</p>
          <a href="#home" className="button button-dark">
            Go to Home
            <ArrowRight size={16} />
          </a>
        </div>
      )}
    </section>
  );
}
