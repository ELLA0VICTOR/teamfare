import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  CalendarDays,
  ChevronDown,
  Home as HomeIcon,
  Plus,
  ReceiptText,
  Users,
  X,
} from "lucide-react";
import { Brand } from "./components/Brand";
import { Home } from "./components/Home";
import type { ComposerValues } from "./components/Home";
import { ExperienceArt } from "./components/ExperienceArt";
import { ExpenseForm } from "./components/Forms";
import { ExpenseLedger, SpendBar } from "./components/ExpenseLedger";
import { Modal } from "./components/Modal";
import { ResearchPanel } from "./components/ResearchPanel";
import { AccountSecurity } from "./components/AccountSecurity";
import { WorkflowPreferences } from "./components/WorkflowPreferences";
import { ReportEmail } from "./components/ReportEmail";
import { InviteEmail } from "./components/InviteEmail";
import { expenseCsv, filteredExpenses } from "./workflows";
import type { ResearchRequest } from "./components/ResearchPanel";
import { PlanSheet } from "./components/PlanSheet";
import { RouteLine } from "./components/RouteLine";
import {
  dateLabel,
  initialDemo,
  loadDemo,
  localDate,
  members,
  money as sourceMoney,
  storageKey,
} from "./data";
import type { Demo, Experience, Expense, Plan, View } from "./data";
import {
  CurrencyNotice,
  CurrencySwitch,
  useCurrency,
} from "./currency-context";
import {
  event,
  needsYou,
  nextAction,
  placeFor,
  totalFor,
  priceFor,
  planExperience,
} from "./plan";
import type { Role } from "./plan";
import "./App.css";
import { api, ApiError, uploadReceipt } from "./api";
import { TeamContext } from "./team-context";
import type { Connection } from "./team-context";
import type { Member } from "./team-context";

type Dialog =
  | { type: "experience"; experience: Experience }
  | { type: "expense"; planId?: string }
  | { type: "cancel"; id: string }
  | {
      type:
        | "about"
        | "reset"
        | "people"
        | "invite"
        | "security"
        | "workflow-preferences"
        | "report-email";
    }
  | null;
const navigation = [
  { view: "discover", label: "Home", icon: HomeIcon },
  { view: "plans", label: "Plans", icon: CalendarDays },
  { view: "expenses", label: "Expenses", icon: ReceiptText },
] as const;
function currentRoute() {
  return window.location.hash.slice(1).split("?")[0] || "home";
}

export default function App({
  connection,
  onExit,
}: {
  connection?: Connection;
  onExit: () => void;
}) {
  const { money, currency, quote, moneySum } = useCurrency();
  const live = !!connection;
  const [demo, setDemo] = useState<Demo>(() => connection?.state ?? loadDemo());
  const [previewRole, setRole] = useState<Role>("employee");
  const role = connection?.user.role ?? previewRole;
  const [teamMembers, setTeamMembers] = useState<Member[]>(
    connection?.members ?? members,
  );
  const viewerId =
    connection?.user.id ?? (role === "manager" ? "nadia" : "akin");
  const viewerName =
    connection?.user.name ?? (role === "manager" ? "Nadia Bello" : "Akin Cole");
  const managerName = live
    ? (teamMembers.find(
        (member) => member.role === "manager" && member.id !== viewerId,
      )?.name ?? "a manager")
    : "Nadia Bello";
  const teamName = connection?.team.name ?? "Koto team";
  const [researchRequest, setResearchRequest] =
    useState<ResearchRequest | null>(null);
  const [saving, setSaving] = useState(false),
    [syncError, setSyncError] = useState(false);
  const [invitation, setInvitation] = useState<{
    id: string;
    code: string;
    expiresAt: string;
  } | null>(null);
  const [inviteRole, setInviteRole] = useState<Role>("employee");
  const mutationLock = useRef(false);
  const refreshSequence = useRef(0);
  const [year] = useState(() => new Date().getFullYear());
  const [route, setRoute] = useState(currentRoute);
  const [profileOpen, setProfileOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [planFilter, setPlanFilter] = useState(() =>
    window.location.hash === "#plans?needs-you" ? "Needs you" : "auto",
  );
  const [expenseFilter, setExpenseFilter] = useState("all");
  const [expenseFrom, setExpenseFrom] = useState("");
  const [expenseTo, setExpenseTo] = useState("");
  const expenseDateError =
    expenseFrom && expenseTo && expenseFrom > expenseTo
      ? "The end date must be on or after the start date."
      : "";
  const profile = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const pending = demo.plans.filter((plan) =>
    needsYou(plan, role, live ? viewerId : "akin"),
  ).length;
  const view: View = route.startsWith("plan")
    ? "plans"
    : route === "expenses"
      ? "expenses"
      : "discover";
  const selectedPlan = route.startsWith("plan/")
    ? demo.plans.find((plan) => plan.id === route.slice(5))
    : undefined;
  const currentFilter =
    planFilter === "auto" ? (pending ? "Needs you" : "Upcoming") : planFilter;
  const filteredPlans = demo.plans.filter(
    (plan) =>
      currentFilter === "All" ||
      (currentFilter === "Needs you"
        ? needsYou(plan, role, live ? viewerId : "akin")
        : currentFilter === "Upcoming"
          ? plan.status === "Approved" &&
            !plan.settledAt &&
            plan.date >= localDate()
          : plan.status === "Cancelled" ||
            (plan.status === "Approved" &&
              (plan.date < localDate() || !!plan.settledAt))),
  );
  const reportFilter = {
    ...(expenseFilter !== "all" ? { planId: expenseFilter } : {}),
    ...(expenseFrom ? { from: expenseFrom } : {}),
    ...(expenseTo ? { to: expenseTo } : {}),
  };
  const visibleExpenses = expenseDateError
    ? []
    : filteredExpenses(demo.expenses, reportFilter);
  const activePlans = demo.plans.filter((plan) => plan.status !== "Cancelled");
  const budget = activePlans.reduce((sum, plan) => sum + plan.budget, 0);
  const spent = demo.expenses
    .filter((expense) => activePlans.some((plan) => plan.id === expense.planId))
    .reduce((sum, expense) => sum + expense.amount, 0);

  useEffect(() => {
    if (live) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(demo));
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- Report failure from the external browser storage API.
      setStorageError(true);
    }
  }, [demo, live]);
  useEffect(() => {
    const update = () => {
      setRoute(currentRoute());
      if (window.location.hash === "#plans?needs-you")
        setPlanFilter("Needs you");
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!profileOpen) return;
    const click = (e: MouseEvent) => {
      if (!profile.current?.contains(e.target as Node)) setProfileOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        profile.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", click);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);
  useEffect(() => {
    if (route.startsWith("plan/")) main.current?.focus({ preventScroll: true });
  }, [route]);

  function navigate(next: string) {
    window.location.hash = next;
  }
  const refresh = useCallback(async () => {
    if (!connection) return;
    const sequence = ++refreshSequence.current;
    const latest = await api<Connection>("/state");
    if (sequence !== refreshSequence.current) return;
    setDemo(latest.state);
    setTeamMembers(latest.members);
    setSyncError(false);
  }, [connection]);
  async function mutate<T>(
    path: string,
    body: unknown,
    method = "POST",
  ): Promise<T | undefined> {
    if (!connection || mutationLock.current) return;
    mutationLock.current = true;
    setSaving(true);
    try {
      const result = await api<T>(path, body, connection.csrfToken, method);
      await refresh();
      return result;
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : "The change could not be saved.",
      );
      if (error instanceof ApiError && error.status === 401) onExit();
      else {
        try {
          await refresh();
        } catch {
          setSyncError(true);
        }
      }
      return;
    } finally {
      mutationLock.current = false;
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!connection) return;
    const sync = () => {
      if (document.visibilityState !== "hidden" && !mutationLock.current)
        void refresh().catch((error) => {
          if (error instanceof ApiError && error.status === 401) onExit();
          else setSyncError(true);
        });
    };
    const timer = setInterval(sync, 10000);
    sync();
    window.addEventListener("focus", sync);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", sync);
    };
  }, [connection, refresh, onExit, route]);
  async function savePlan(plan: Plan) {
    if (!live) {
      setDemo((current) => ({
        ...current,
        plans: current.plans.map((item) => (item.id === plan.id ? plan : item)),
      }));
      return true;
    }
    const previous = demo.plans.find((item) => item.id === plan.id)!;
    if (
      ["Draft", "Changes requested"].includes(previous.status) &&
      ["Draft", "Awaiting approval"].includes(plan.status)
    ) {
      const result = await mutate<Plan>(
        `/plans/${plan.id}`,
        {
          experienceId: plan.experienceId,
          title: plan.title,
          date: plan.date,
          time: plan.time,
          people: plan.people,
          budget: plan.budget,
          location: placeFor(plan),
          note: plan.note,
          attendees: plan.attendees,
          durationMinutes: plan.durationMinutes ?? 120,
          emailGuests: plan.emailGuests ?? false,
          revision: plan.revision,
          submit: plan.status === "Awaiting approval",
          ...(plan.proposal
            ? {
                costs: plan.proposal.costs.map(({ label, amount, unit }) => ({
                  label,
                  amount,
                  unit,
                })),
                itinerary: plan.proposal.itinerary,
              }
            : {}),
        },
        "PUT",
      );
      return !!result;
    }
    const action =
      plan.status === "Cancelled"
        ? "cancel"
        : plan.settledAt
          ? "settle"
          : plan.status === "Approved"
            ? "approve"
            : "request-changes";
    return !!(await mutate(`/plans/${plan.id}/action`, {
      action,
      revision: plan.revision,
      ...(action === "request-changes" ? { note: plan.reviewNote } : {}),
    }));
  }
  async function saveIdea(id: string) {
    if (live) {
      await mutate(`/saved/${id}`, { saved: !demo.saved.includes(id) }, "PUT");
      return;
    }
    setDemo((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((item) => item !== id)
        : [...current.saved, id],
    }));
  }
  async function preference(value: string) {
    if (live) {
      await mutate("/preferences", { preference: value }, "PUT");
      return;
    }
    setDemo((current) => ({ ...current, preference: value }));
  }
  async function signOut() {
    if (mutationLock.current) return;
    try {
      await api("/auth/logout", {}, connection!.csrfToken);
      onExit();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) onExit();
      else setToast("Sign out could not be completed. Please try again.");
    }
  }
  function beginResearch(values: ComposerValues) {
    if (values.brief.trim().length < 10) {
      setToast(
        "Describe the outing in at least ten characters to begin research.",
      );
      return;
    }
    setResearchRequest({ ...values, requestId: crypto.randomUUID() });
    navigate("research");
  }
  const researchStarted = useCallback((id: string) => {
    window.location.hash = `research/${id}`;
  }, []);
  const researchSaved = useCallback(
    async (plan: Plan) => {
      await refresh();
      window.location.hash = `plan/${plan.id}`;
    },
    [refresh],
  );
  async function start(
    values: ComposerValues = {
      brief: "",
      people: 8,
      location: "Lagos",
      date: localDate(8),
      perPerson: 25000,
    },
    experienceId?: string,
  ) {
    const chosen =
      experienceId ??
      (/(clay|potter|creativ|mak)/i.test(values.brief)
        ? "clay"
        : /(court|tennis|outdoor|sport)/i.test(values.brief)
          ? "court"
          : /(dinner|supper|evening)/i.test(values.brief)
            ? "supper"
            : "long-table");
    const plan: Plan = {
      id: crypto.randomUUID(),
      experienceId: chosen,
      title: "A little time together",
      date: values.date,
      time: "13:00",
      people: values.people,
      budget: values.people * values.perPerson,
      location: values.location,
      status: "Draft",
      note: values.brief,
      attendees: members.slice(0, values.people).map((member) => member.id),
      going: [],
      declined: [],
      events: [event("Akin created the draft.")],
    };
    if (live) {
      const created = await mutate<Plan>("/plans", {
        experienceId: chosen,
        title: plan.title,
        date: plan.date,
        time: plan.time,
        people: plan.people,
        budget: plan.budget,
        location: values.location,
        note: values.brief,
        attendees: [
          viewerId,
          ...teamMembers
            .filter((member) => member.id !== viewerId)
            .map((member) => member.id),
        ].slice(0, values.people),
        emailGuests: true,
        durationMinutes: 120,
      });
      if (created) {
        setDialog(null);
        navigate(`plan/${created.id}`);
      }
      return;
    }
    setDemo((current) => ({ ...current, plans: [...current.plans, plan] }));
    setRole("employee");
    setDialog(null);
    navigate(`plan/${plan.id}`);
  }
  async function rsvp(plan: Plan, going: boolean) {
    if (live) {
      const result = await mutate<Plan>(`/plans/${plan.id}/rsvp`, {
        going,
        revision: plan.revision,
      });
      if (result)
        setToast(
          `RSVP updated. ${result.going.length} of ${result.people} people going.`,
        );
      return;
    }
    if (
      role !== "employee" ||
      plan.status !== "Approved" ||
      !plan.attendees.includes("akin") ||
      plan.settledAt ||
      plan.date < localDate()
    )
      return;
    const previous = going
      ? plan.going.includes("akin")
      : plan.declined?.includes("akin");
    if (previous) return;
    const next = {
      ...plan,
      going: [
        ...plan.going.filter((id) => id !== "akin"),
        ...(going ? ["akin"] : []),
      ],
      declined: [
        ...(plan.declined ?? []).filter((id) => id !== "akin"),
        ...(!going ? ["akin"] : []),
      ],
      events: [
        ...(plan.events ?? []),
        event(`Akin ${going ? "is going." : "can’t make it."}`),
      ],
    };
    savePlan(next);
    setToast(
      `RSVP updated. ${next.going.length} of ${next.people} people going.`,
    );
  }
  async function addExpense(expense: Expense, receipt?: File) {
    if (live) {
      const { id: _id, ...fields } = expense;
      const created = await mutate<Expense>("/expenses", {
        ...fields,
        requestId: expense.id,
      });
      if (created) {
        setDialog(null);
        if (receipt) {
          try {
            await uploadReceipt(created.id, receipt, connection!.csrfToken);
            await refresh();
            setToast("Expense and receipt recorded. No payment was made.");
          } catch (error) {
            setToast(
              "Expense recorded; receipt upload failed. Attach it from the expense record. " +
                (error instanceof Error ? error.message : ""),
            );
          }
        } else setToast("Expense recorded. No payment was made.");
      }
      return;
    }
    setDemo((current) => ({
      ...current,
      expenses: [...current.expenses, expense],
      plans: current.plans.map((plan) =>
        plan.id === expense.planId
          ? {
              ...plan,
              events: [
                ...(plan.events ?? []),
                event(
                  `${expense.payer} recorded ${sourceMoney(expense.amount)} for ${expense.description}.`,
                ),
              ],
            }
          : plan,
      ),
    }));
    setDialog(null);
    setToast("Expense recorded. No payment was made.");
  }
  function exportExpenses() {
    if (!visibleExpenses.length) {
      setToast("There are no expenses to export.");
      return;
    }
    const url = URL.createObjectURL(
      new Blob([expenseCsv(visibleExpenses, demo.plans, { currency, quote })], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `teamfare-expenses-${localDate()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast("Expense report downloaded.");
  }
  const navLinks = navigation.map(({ view: item, label, icon: Icon }) => (
    <a
      key={item}
      href={`#${item === "discover" ? "home" : item}`}
      aria-label={label}
      aria-current={view === item ? "page" : undefined}
    >
      <Icon size={19} />
      <span>{label}</span>
      {item === "plans" && pending > 0 && (
        <span className="nav-count" aria-label={`${pending} need you`}>
          {pending}
        </span>
      )}
    </a>
  ));
  return (
    <TeamContext.Provider
      value={{
        live,
        viewerId,
        viewerName,
        managerName,
        members: teamMembers,
        teamName,
      }}
    >
      <>
        <a
          className="skip-link"
          href="#main"
          onClick={(e) => {
            e.preventDefault();
            main.current?.focus();
          }}
        >
          Skip to content
        </a>
        <header className="site-header">
          <div className="header-inner">
            <a href="#home" aria-label="Teamfare home" className="brand-link">
              <Brand />
            </a>
            <nav className="main-nav" aria-label="Main navigation">
              {navLinks}
            </nav>
            <div className="account" ref={profile}>
              <CurrencySwitch />
              <span className="team-name">{teamName}</span>
              <button
                className="account-button"
                aria-label={live ? "Account" : "Account and demo role"}
                aria-expanded={profileOpen}
                onClick={() => setProfileOpen(!profileOpen)}
              >
                <span className="monogram">
                  {teamMembers.find((member) => member.id === viewerId)
                    ?.initials ?? "TF"}
                </span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && (
                <div className="account-menu">
                  <strong>{viewerName}</strong>
                  <span>
                    {role === "employee"
                      ? "Employee · organiser"
                      : "Manager · approvals"}
                  </span>
                  <hr />
                  {!live &&
                    (["employee", "manager"] as const).map((item) => (
                      <button
                        key={item}
                        onClick={() => {
                          setRole(item);
                          setPlanFilter("auto");
                          setProfileOpen(false);
                        }}
                        aria-pressed={role === item}
                      >
                        Try the {item} view
                        <span>{role === item ? "✓" : "→"}</span>
                      </button>
                    ))}
                  <button
                    onClick={() => {
                      setDialog({ type: "people" });
                      setProfileOpen(false);
                    }}
                  >
                    Team preferences
                    <Users size={15} />
                  </button>
                  {live ? (
                    <>
                      <button
                        onClick={() => {
                          void refresh().catch(() => setSyncError(true));
                          setProfileOpen(false);
                        }}
                      >
                        Refresh team data
                      </button>
                      {role === "manager" && !connection?.user.judge && (
                        <button
                          onClick={() => {
                            setInvitation(null);
                            setDialog({ type: "invite" });
                            setProfileOpen(false);
                          }}
                        >
                          Invite teammate
                        </button>
                      )}
                      {!connection?.user.judge && (
                        <button
                          onClick={() => {
                            setDialog({ type: "security" });
                            setProfileOpen(false);
                          }}
                        >
                          Account security
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setDialog({ type: "workflow-preferences" });
                          setProfileOpen(false);
                        }}
                      >
                        Outing preferences
                      </button>
                      <button onClick={() => void signOut()}>Sign out</button>
                      <p>{connection?.user.email}</p>
                    </>
                  ) : (
                    <>
                      <button onClick={onExit}>Sign in to Teamfare</button>
                      <p>
                        Role switch for this local preview; not authentication.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <nav className="bottom-nav" aria-label="Mobile navigation">
          {navLinks}
        </nav>
        <main
          id="main"
          ref={main}
          tabIndex={-1}
          className={`page-width ${selectedPlan ? "sheet-page" : ""}`}
          aria-busy={saving}
        >
          {saving && (
            <p className="save-status" role="status">
              Saving to your team…
            </p>
          )}
          {connection?.user.judge && (
            <p className="field-help judge-notice" role="note">
              Shared judge team · Use sample information only. Changes are
              visible to other judges. Real research uses Vultr and Tavily;
              sample plans are labelled.
            </p>
          )}
          {syncError && (
            <p className="storage-warning" role="alert">
              Connection lost. Changes cannot be saved until the server
              reconnects.
            </p>
          )}
          {storageError && (
            <p className="storage-warning" role="alert">
              Browser storage is unavailable. Changes will be lost when you
              close this page.
            </p>
          )}
          {view === "discover" && !route.startsWith("research") && (
            <Home
              demo={demo}
              role={role}
              onStart={start}
              onResearch={live ? beginResearch : undefined}
              onSaveIdea={saveIdea}
              onExplore={(experience) =>
                setDialog({ type: "experience", experience })
              }
            />
          )}
          {route.startsWith("research") &&
            (live ? (
              <ResearchPanel
                key={
                  route.startsWith("research/")
                    ? route.slice(9)
                    : (researchRequest?.requestId ?? "research")
                }
                runId={
                  route.startsWith("research/") ? route.slice(9) : undefined
                }
                request={researchRequest}
                csrf={connection!.csrfToken}
                onStarted={researchStarted}
                onSaved={researchSaved}
                onManual={start}
                onRestart={beginResearch}
                onExpired={onExit}
              />
            ) : (
              <div className="empty-state">
                <h1>Research with your team.</h1>
                <p>
                  Sign in to research real outing options and save a shared
                  draft.
                </p>
                <button className="button button-dark" onClick={onExit}>
                  Sign in
                </button>
              </div>
            ))}
          {view === "plans" &&
            (route.startsWith("plan/") ? (
              selectedPlan ? (
                <PlanSheet
                  key={`${selectedPlan.id}-${selectedPlan.status}-${role}-${live ? selectedPlan.revision : "local"}`}
                  plan={selectedPlan}
                  expenses={demo.expenses.filter(
                    (expense) => expense.planId === selectedPlan.id,
                  )}
                  role={role}
                  onSave={savePlan}
                  onRsvp={(going) => rsvp(selectedPlan, going)}
                  onExpense={() =>
                    setDialog({ type: "expense", planId: selectedPlan.id })
                  }
                  onCancel={() =>
                    setDialog({ type: "cancel", id: selectedPlan.id })
                  }
                  announce={setToast}
                  csrf={connection?.csrfToken}
                  onChanged={refresh}
                />
              ) : (
                <div className="empty-state">
                  <h1>Plan not found</h1>
                  <p>
                    {live
                      ? "This plan is not available in your team."
                      : "This plan may have been removed when the preview was reset."}
                  </p>
                  <a href="#plans" className="button button-outline">
                    Back to plans
                  </a>
                </div>
              )
            ) : (
              <section className="plans-page">
                <header className="page-heading">
                  <div>
                    <span className="eyebrow">Good ideas, taking shape</span>
                    <h1>Plans</h1>
                    <p>From “we should” to “see you there”.</p>
                  </div>
                  <button
                    className="button button-dark"
                    onClick={() => start()}
                  >
                    Plan something
                    <Plus size={18} />
                  </button>
                </header>
                <div
                  className="text-tabs"
                  role="group"
                  aria-label="Filter plans"
                >
                  {["Needs you", "Upcoming", "Past and cancelled", "All"].map(
                    (filter) => (
                      <button
                        key={filter}
                        aria-pressed={currentFilter === filter}
                        className={currentFilter === filter ? "active" : ""}
                        onClick={() => {
                          setPlanFilter(filter);
                          if (window.location.hash.includes("?"))
                            navigate("plans");
                        }}
                      >
                        {filter}
                        {filter === "Needs you" && (
                          <span className={pending ? "attention-count" : ""}>
                            {pending}
                          </span>
                        )}
                      </button>
                    ),
                  )}
                </div>
                <div className="plans-list">
                  {filteredPlans.map((plan) => (
                    <a
                      href={`#plan/${plan.id}`}
                      key={plan.id}
                      className="plan-row"
                      aria-label={`View ${plan.title}`}
                    >
                      <div className="plan-thumbnail">
                        <ExperienceArt experience={planExperience(plan)} />
                      </div>
                      <div className="plan-row-main">
                        <h2>{plan.title}</h2>
                        <p>
                          {dateLabel(plan.date)} · {placeFor(plan)} ·{" "}
                          {plan.people} people
                        </p>
                        <RouteLine compact plan={plan} />
                      </div>
                      <div className="plan-row-cost">
                        <strong>
                          {money(totalFor(plan))}
                          <small>Estimate · total</small>
                        </strong>
                        <span>
                          {plan.proposal ? "≈ " : ""}
                          {money(priceFor(plan))}{" "}
                          {plan.proposal ? "average per person" : "per person"}
                        </span>
                        <span
                          className={`row-action ${needsYou(plan, role, live ? viewerId : "akin") ? "needs-action" : ""}`}
                        >
                          {nextAction(plan, role, live ? viewerId : "akin")}
                          <ArrowRight size={16} />
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
                {!filteredPlans.length && (
                  <div className="empty-state">
                    <CalendarDays size={40} strokeWidth={1} />
                    <h2>
                      {currentFilter === "Needs you"
                        ? "You’re all caught up."
                        : currentFilter === "Upcoming"
                          ? "Make room for a good plan."
                          : "Nothing here yet."}
                    </h2>
                    <p>
                      {currentFilter === "Needs you"
                        ? "No plans are waiting on your next move."
                        : "Your team’s outings will appear here."}
                    </p>
                    <button className="text-button" onClick={() => start()}>
                      Start a plan
                      <ArrowRight size={16} />
                    </button>
                  </div>
                )}
                {!demo.plans.length && (
                  <div className="first-run">
                    <h2>A good plan, in five steps.</h2>
                    {[
                      "Idea — shape the outing.",
                      "Proposed — send it for review.",
                      "Approved — let the team RSVP.",
                      "Happening — enjoy the time together.",
                      "Settled — finish the expense record.",
                    ].map((text) => (
                      <p key={text}>{text}</p>
                    ))}
                  </div>
                )}
                <p className="field-help page-footnote">
                  {live
                    ? "Plans and decisions are saved to your team. Approved outings can queue invitations and reminders; check email status. No venue is booked."
                    : "Plans and decisions are saved in this browser. Bookings and invitations are not sent."}
                </p>
              </section>
            ))}
          {view === "expenses" && (
            <section className="expenses-page">
              <header className="page-heading">
                <div>
                  <span className="eyebrow">Every outing, accounted for</span>
                  <h1>Expenses</h1>
                  <p>A clear record. Fewer loose ends.</p>
                </div>
                <div className="page-heading-actions">
                  <button
                    className="button button-outline"
                    onClick={exportExpenses}
                    disabled={!!expenseDateError}
                  >
                    <ArrowDownToLine size={17} />
                    Export CSV
                  </button>
                  {live && role === "manager" && !connection?.user.judge && (
                    <button
                      className="button button-outline"
                      disabled={!!expenseDateError || !visibleExpenses.length}
                      onClick={() => setDialog({ type: "report-email" })}
                    >
                      Email report
                    </button>
                  )}
                  <button
                    className="button button-dark"
                    onClick={() => setDialog({ type: "expense" })}
                  >
                    Add expense
                    <Plus size={18} />
                  </button>
                </div>
              </header>
              <div className="expense-summary">
                <p>
                  <strong>
                    {moneySum(
                      demo.expenses
                        .filter((e) =>
                          activePlans.some((p) => p.id === e.planId),
                        )
                        .map((e) => e.amount),
                    )}
                  </strong>{" "}
                  recorded against {moneySum(activePlans.map((p) => p.budget))}{" "}
                  total budget.
                </p>
                <SpendBar spent={spent} budget={budget} />
                <span>
                  Across {activePlans.length} active{" "}
                  {activePlans.length === 1 ? "outing" : "outings"}. Cancelled
                  outings are excluded from this overview; their records remain
                  below. Filters apply to the report and export below.
                </span>
              </div>
              <div className="expense-tools">
                <label className="field">
                  Show expenses for
                  <span className="select-control">
                    <select
                      aria-label="Filter expenses by outing"
                      value={expenseFilter}
                      onChange={(e) => setExpenseFilter(e.target.value)}
                    >
                      <option value="all">All outings</option>
                      {demo.plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.title}
                          {plan.status === "Cancelled" ? " (cancelled)" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="select-chevron"
                      size={12}
                      aria-hidden="true"
                    />
                  </span>
                </label>
                <label className="field">
                  From date
                  <input
                    type="date"
                    value={expenseFrom}
                    onChange={(e) => setExpenseFrom(e.target.value)}
                    aria-invalid={!!expenseDateError}
                    aria-describedby={
                      expenseDateError ? "expense-date-error" : undefined
                    }
                  />
                </label>
                <label className="field">
                  To date
                  <input
                    type="date"
                    value={expenseTo}
                    onChange={(e) => setExpenseTo(e.target.value)}
                    aria-invalid={!!expenseDateError}
                    aria-describedby={
                      expenseDateError ? "expense-date-error" : undefined
                    }
                  />
                </label>
                {expenseDateError && (
                  <p
                    id="expense-date-error"
                    className="form-error expense-report-line"
                    role="alert"
                  >
                    {expenseDateError}
                  </p>
                )}
                <p className="field-help">
                  {visibleExpenses.length}{" "}
                  {visibleExpenses.length === 1 ? "expense" : "expenses"} ·{" "}
                  {moneySum(visibleExpenses.map((expense) => expense.amount))}{" "}
                  recorded total in this report. Dates include both endpoints;
                  CSV follows these filters.
                </p>
                {(expenseFrom || expenseTo || expenseFilter !== "all") && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setExpenseFrom("");
                      setExpenseTo("");
                      setExpenseFilter("all");
                    }}
                  >
                    Clear expense filters
                  </button>
                )}
              </div>
              {demo.plans
                .filter(
                  (plan) =>
                    (expenseFilter === "all" || plan.id === expenseFilter) &&
                    visibleExpenses.some(
                      (expense) => expense.planId === plan.id,
                    ),
                )
                .map((plan) => {
                  const records = visibleExpenses.filter(
                      (expense) => expense.planId === plan.id,
                    ),
                    recorded = records.reduce(
                      (sum, expense) => sum + expense.amount,
                      0,
                    );
                  return (
                    <section className="expense-group" key={plan.id}>
                      <header>
                        <div>
                          <h2>
                            <a href={`#plan/${plan.id}`}>
                              {plan.title}
                              <ArrowRight size={19} />
                            </a>
                          </h2>
                          <p>
                            {dateLabel(plan.date)} · {plan.people} people
                            {plan.status === "Cancelled"
                              ? " · Cancelled"
                              : plan.settledAt
                                ? " · Settled"
                                : ""}
                          </p>
                          <p className="group-estimate">
                            Estimate {money(totalFor(plan))} total ·{" "}
                            {plan.proposal
                              ? `≈ ${money(priceFor(plan))} average per person`
                              : `${money(priceFor(plan))} per person × ${plan.people}`}
                          </p>
                        </div>
                        <div className="group-spend">
                          <span>
                            Recorded {moneySum(records.map((e) => e.amount))}{" "}
                            total / Budget {money(plan.budget)} total
                          </span>
                          <SpendBar spent={recorded} budget={plan.budget} />
                        </div>
                      </header>
                      <ExpenseLedger
                        expenses={records}
                        locked={!!plan.settledAt || plan.status === "Cancelled"}
                        csrf={connection?.csrfToken}
                        onChanged={refresh}
                      />
                    </section>
                  );
                })}
              {!visibleExpenses.length && (
                <div className="empty-state">
                  <ReceiptText size={40} strokeWidth={1} />
                  <h2>
                    {expenseFrom || expenseTo || expenseFilter !== "all"
                      ? "No matching expenses."
                      : "Start a clear record."}
                  </h2>
                  <p>
                    {expenseFrom || expenseTo || expenseFilter !== "all"
                      ? "Adjust the outing or date range to see more records."
                      : "Record an expense against an approved outing."}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setDialog({ type: "expense" })}
                  >
                    Add expense
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
              <p className="field-help page-footnote">
                Expense records only. No card is charged and no reimbursement is
                initiated.
              </p>
            </section>
          )}
        </main>
        <footer className="site-footer page-width">
          <CurrencyNotice />
          <span>Time together. Well spent.</span>
          <div>
            <button onClick={() => setDialog({ type: "about" })}>
              {live ? "About Teamfare" : "About this preview"}
            </button>
            {!live && (
              <button onClick={() => setDialog({ type: "reset" })}>
                Reset preview
              </button>
            )}
          </div>
          <span>Teamfare © {year}</span>
        </footer>
        <div
          className={`toast ${toast ? "toast-visible" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast}
          <button
            onClick={() => {
              setToast("");
              main.current?.focus({ preventScroll: true });
            }}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
        {dialog?.type === "security" && connection && (
          <Modal title="Account security" onClose={() => setDialog(null)}>
            <AccountSecurity
              csrf={connection.csrfToken}
              email={connection.user.email}
              onSignedOut={onExit}
            />
          </Modal>
        )}
        {dialog?.type === "workflow-preferences" && connection && (
          <Modal title="Outing preferences" onClose={() => setDialog(null)}>
            <WorkflowPreferences
              csrf={connection.csrfToken}
              onChanged={refresh}
            />
          </Modal>
        )}
        {dialog?.type === "report-email" && connection && (
          <Modal title="Email expense report" onClose={() => setDialog(null)}>
            <ReportEmail filter={reportFilter} csrf={connection.csrfToken} />
          </Modal>
        )}
        {dialog?.type === "invite" && live && role === "manager" && (
          <Modal title="Invite teammate" onClose={() => setDialog(null)}>
            <h2>A place at the table.</h2>
            <p className="modal-description">
              Create a one-use code and share it with your teammate. It expires
              in three days. No email is sent automatically.
            </p>
            {!invitation ? (
              <>
                <label className="field">
                  Team role
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as Role)}
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">
                      Manager (can approve plans and invite people)
                    </option>
                  </select>
                </label>
                <button
                  className="button button-dark modal-done"
                  disabled={saving}
                  onClick={async () => {
                    const result = await mutate<{
                      id: string;
                      code: string;
                      expiresAt: string;
                    }>("/invites", { role: inviteRole });
                    if (result) setInvitation(result);
                  }}
                >
                  Create invitation code
                </button>
              </>
            ) : (
              <>
                <label className="field">
                  Invitation code
                  <input
                    readOnly
                    value={invitation.code}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <p className="field-help">
                  Ask them to open Teamfare, choose Join a team, and enter this
                  code. Share it only with the intended teammate.
                </p>
                <button
                  className="button button-dark modal-done"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(invitation.code);
                      setToast("Invitation code copied.");
                    } catch {
                      setToast(
                        "Select the invitation code and copy it manually.",
                      );
                    }
                  }}
                >
                  Copy code
                </button>
                {connection && (
                  <InviteEmail
                    invite={invitation}
                    csrf={connection.csrfToken}
                  />
                )}
              </>
            )}
          </Modal>
        )}
        {dialog?.type === "expense" && (
          <ExpenseForm
            plans={demo.plans}
            defaultPlanId={dialog.planId}
            onClose={() => setDialog(null)}
            onSubmit={addExpense}
          />
        )}
        {dialog?.type === "experience" && (
          <Modal
            title="Experience details"
            wide
            onClose={() => setDialog(null)}
          >
            <div className="experience-detail">
              <ExperienceArt experience={dialog.experience} />
              <div>
                <span className="eyebrow">{dialog.experience.category}</span>
                <h2>{dialog.experience.name}</h2>
                <p>{dialog.experience.description}</p>
                <p>
                  {dialog.experience.area} · {dialog.experience.duration}
                </p>
                <ul>
                  {dialog.experience.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <strong className="detail-price">
                  {money(dialog.experience.price)} per person
                </strong>
                <p className="field-help">
                  Sample experience, estimated price. No live availability or
                  booking.
                </p>
                <button
                  className="button button-dark"
                  onClick={() =>
                    start(
                      {
                        brief: "",
                        people: 8,
                        date: localDate(8),
                        location: dialog.experience.area,
                        perPerson: dialog.experience.price + 2500,
                      },
                      dialog.experience.id,
                    )
                  }
                >
                  Start a plan
                  <ArrowRight size={18} />
                </button>
              </div>
            </div>
          </Modal>
        )}
        {dialog?.type === "cancel" && (
          <Modal title="Cancel outing" onClose={() => setDialog(null)}>
            <h2>Cancel this outing?</h2>
            <p className="modal-description">
              It will leave Upcoming. Recorded expenses and activity will
              remain. No external venue booking is affected.
            </p>
            <div className="form-actions">
              <button
                className="button button-outline"
                onClick={() => setDialog(null)}
              >
                Keep outing
              </button>
              <button
                className="button button-dark"
                onClick={async () => {
                  const plan = demo.plans.find(
                    (item) => item.id === dialog.id,
                  )!;
                  const saved = await savePlan({
                    ...plan,
                    status: "Cancelled",
                    events: [
                      ...(plan.events ?? []),
                      event(
                        `${role === "manager" ? "Nadia" : "Akin"} cancelled the outing.`,
                      ),
                    ],
                  });
                  if (!saved) return;
                  setDialog(null);
                  navigate("plans");
                  setPlanFilter("Upcoming");
                  setToast("Outing cancelled. Expense records are kept.");
                }}
              >
                Cancel outing
              </button>
            </div>
          </Modal>
        )}
        {dialog?.type === "about" && (
          <Modal
            title={live ? "About Teamfare" : "About this preview"}
            onClose={() => setDialog(null)}
          >
            <h2>
              Good company.
              <br />
              Less coordination.
            </h2>
            <p className="modal-description">
              {live
                ? "Your team shares plans, approvals, RSVPs and expenses through the Teamfare server. Experiences and prices are still samples."
                : "Teamfare brings outing plans, approvals, RSVPs and expenses into one place. This preview uses sample experiences and fictional teammates, with changes saved in your browser."}
            </p>
            <p>
              {live
                ? "Live research, availability replies, calendar files, coordination emails, private receipts and expense reports run through the team backend. Venue availability still needs direct confirmation. No booking, card charge or reimbursement is made."
                : "AI research, authentication, venue bookings, invitations, payments and cloud services are not connected. The manager switch is for exploring the local workflow."}
            </p>
            <button
              className="button button-dark modal-done"
              onClick={() => setDialog(null)}
            >
              Back to Teamfare
            </button>
          </Modal>
        )}
        {dialog?.type === "reset" && (
          <Modal title="Reset preview" onClose={() => setDialog(null)}>
            <h2>A fresh start?</h2>
            <p className="modal-description">
              This removes your local plans, saved ideas, preferences and
              expenses, then restores the sample outings.
            </p>
            <div className="form-actions">
              <button
                className="button button-outline"
                onClick={() => setDialog(null)}
              >
                Keep my changes
              </button>
              <button
                className="button button-dark"
                onClick={() => {
                  setDemo(structuredClone(initialDemo));
                  setRole("employee");
                  setPlanFilter("auto");
                  setExpenseFilter("all");
                  setDialog(null);
                  navigate("home");
                  setToast("Preview reset.");
                }}
              >
                Reset preview
              </button>
            </div>
          </Modal>
        )}
        {dialog?.type === "people" && (
          <Modal title="Team preferences" onClose={() => setDialog(null)}>
            <h2>Your team, considered.</h2>
            <p className="modal-description">
              {live
                ? `${teamMembers.length} teammates. Your dietary preference is saved to your account.`
                : "Eight sample teammates. Preferences are saved here for planning; they are not sent to a venue."}
            </p>
            <label className="field">
              Dietary preference
              <select
                value={demo.preference}
                onChange={(e) => void preference(e.target.value)}
              >
                <option>No preference</option>
                <option>Vegetarian options</option>
                <option>Vegan options</option>
                <option>Halal options</option>
              </select>
            </label>
            <div className="preference-people">
              {teamMembers.map((member) => (
                <span key={member.id}>
                  <span className="monogram">{member.initials}</span>
                  {member.name}
                </span>
              ))}
            </div>
            <button
              className="button button-dark"
              onClick={() => setDialog(null)}
            >
              Done
            </button>
          </Modal>
        )}
      </>
    </TeamContext.Provider>
  );
}
