import { useEffect, useRef, useState } from "react";
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
import { PlanSheet } from "./components/PlanSheet";
import { RouteLine } from "./components/RouteLine";
import {
  dateLabel,
  experienceFor,
  initialDemo,
  loadDemo,
  localDate,
  members,
  money,
  storageKey,
} from "./data";
import type { Demo, Experience, Expense, Plan, View } from "./data";
import { event, needsYou, nextAction, placeFor, totalFor } from "./plan";
import type { Role } from "./plan";
import "./App.css";

type Dialog =
  | { type: "experience"; experience: Experience }
  | { type: "expense"; planId?: string }
  | { type: "cancel"; id: string }
  | { type: "about" | "reset" | "people" }
  | null;
const navigation = [
  { view: "discover", label: "Home", icon: HomeIcon },
  { view: "plans", label: "Plans", icon: CalendarDays },
  { view: "expenses", label: "Expenses", icon: ReceiptText },
] as const;
function currentRoute() {
  return window.location.hash.slice(1).split("?")[0] || "home";
}

export default function App() {
  const [demo, setDemo] = useState<Demo>(loadDemo);
  const [role, setRole] = useState<Role>("employee");
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
  const profile = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLElement>(null);
  const pending = demo.plans.filter((plan) => needsYou(plan, role)).length;
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
        ? needsYou(plan, role)
        : currentFilter === "Upcoming"
          ? plan.status === "Approved" &&
            !plan.settledAt &&
            plan.date >= localDate()
          : plan.status === "Cancelled" ||
            (plan.status === "Approved" &&
              (plan.date < localDate() || !!plan.settledAt))),
  );
  const visibleExpenses = demo.expenses.filter(
    (expense) => expenseFilter === "all" || expense.planId === expenseFilter,
  );
  const activePlans = demo.plans.filter((plan) => plan.status !== "Cancelled");
  const budget = activePlans.reduce((sum, plan) => sum + plan.budget, 0);
  const spent = demo.expenses
    .filter((expense) => activePlans.some((plan) => plan.id === expense.planId))
    .reduce((sum, expense) => sum + expense.amount, 0);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(demo));
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- Report failure from the external browser storage API.
      setStorageError(true);
    }
  }, [demo]);
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
  function savePlan(plan: Plan) {
    setDemo((current) => ({
      ...current,
      plans: current.plans.map((item) => (item.id === plan.id ? plan : item)),
    }));
  }
  function start(
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
    setDemo((current) => ({ ...current, plans: [...current.plans, plan] }));
    setRole("employee");
    setDialog(null);
    navigate(`plan/${plan.id}`);
  }
  function rsvp(plan: Plan, going: boolean) {
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
  function addExpense(expense: Expense) {
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
                  `${expense.payer} recorded ${money(expense.amount)} for ${expense.description}.`,
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
    const cell = (value: string | number) =>
      `"${String(value)
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Outing", "Description", "Category", "Paid by", "Amount (NGN)"],
      ...visibleExpenses.map((expense) => [
        expense.date,
        demo.plans.find((plan) => plan.id === expense.planId)?.title ?? "",
        expense.description,
        expense.category,
        expense.payer,
        expense.amount,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
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
            <span className="team-name">Koto team</span>
            <button
              className="account-button"
              aria-label="Account and demo role"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <span className="monogram">
                {role === "employee" ? "AC" : "NB"}
              </span>
              <ChevronDown size={15} />
            </button>
            {profileOpen && (
              <div className="account-menu">
                <strong>
                  {role === "employee" ? "Akin Cole" : "Nadia Bello"}
                </strong>
                <span>
                  {role === "employee"
                    ? "Employee · organiser"
                    : "Manager · approvals"}
                </span>
                <hr />
                {(["employee", "manager"] as const).map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setRole(item);
                      setPlanFilter("auto");
                      setProfileOpen(false);
                    }}
                    aria-pressed={role === item}
                  >
                    Try the {item} view<span>{role === item ? "✓" : "→"}</span>
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
                <p>Role switch for this local preview; not authentication.</p>
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
      >
        {storageError && (
          <p className="storage-warning" role="alert">
            Browser storage is unavailable. Changes will be lost when you close
            this page.
          </p>
        )}
        {view === "discover" && (
          <Home
            demo={demo}
            role={role}
            onStart={start}
            onSaveIdea={(id) =>
              setDemo((current) => ({
                ...current,
                saved: current.saved.includes(id)
                  ? current.saved.filter((item) => item !== id)
                  : [...current.saved, id],
              }))
            }
            onExplore={(experience) =>
              setDialog({ type: "experience", experience })
            }
          />
        )}
        {view === "plans" &&
          (route.startsWith("plan/") ? (
            selectedPlan ? (
              <PlanSheet
                key={`${selectedPlan.id}-${selectedPlan.status}-${role}`}
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
              />
            ) : (
              <div className="empty-state">
                <h1>Plan not found</h1>
                <p>
                  This plan may have been removed when the preview was reset.
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
                <button className="button button-dark" onClick={() => start()}>
                  Plan something
                  <Plus size={18} />
                </button>
              </header>
              <div className="text-tabs" role="group" aria-label="Filter plans">
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
                      <ExperienceArt
                        experience={experienceFor(plan.experienceId)}
                      />
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
                        {money(experienceFor(plan.experienceId).price)} per
                        person
                      </span>
                      <span
                        className={`row-action ${needsYou(plan, role) ? "needs-action" : ""}`}
                      >
                        {nextAction(plan, role)}
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
                Plans and decisions are saved in this browser. Bookings and
                invitations are not sent.
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
                >
                  <ArrowDownToLine size={17} />
                  Export CSV
                </button>
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
                <strong>{money(spent)}</strong> recorded against {money(budget)}{" "}
                total budget.
              </p>
              <SpendBar spent={spent} budget={budget} />
              <span>
                Across {activePlans.length} active{" "}
                {activePlans.length === 1 ? "outing" : "outings"}. Cancelled
                outings are excluded from this overview; their records remain
                below.
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
              <p className="field-help">
                Amounts in NGN · export follows your filter.
              </p>
            </div>
            {demo.plans
              .filter(
                (plan) =>
                  (expenseFilter === "all" || plan.id === expenseFilter) &&
                  demo.expenses.some((expense) => expense.planId === plan.id),
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
                          {money(experienceFor(plan.experienceId).price)} per
                          person × {plan.people}
                        </p>
                      </div>
                      <div className="group-spend">
                        <span>
                          Recorded {money(recorded)} total / Budget{" "}
                          {money(plan.budget)} total
                        </span>
                        <SpendBar spent={recorded} budget={plan.budget} />
                      </div>
                    </header>
                    <ExpenseLedger expenses={records} />
                  </section>
                );
              })}
            {!visibleExpenses.length && (
              <div className="empty-state">
                <ReceiptText size={40} strokeWidth={1} />
                <h2>Start a clear record.</h2>
                <p>Record an expense against an approved outing.</p>
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
        <span>Time together. Well spent.</span>
        <div>
          <button onClick={() => setDialog({ type: "about" })}>
            About this preview
          </button>
          <button onClick={() => setDialog({ type: "reset" })}>
            Reset preview
          </button>
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
      {dialog?.type === "expense" && (
        <ExpenseForm
          plans={demo.plans}
          defaultPlanId={dialog.planId}
          onClose={() => setDialog(null)}
          onSubmit={addExpense}
        />
      )}
      {dialog?.type === "experience" && (
        <Modal title="Experience details" wide onClose={() => setDialog(null)}>
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
            It will leave Upcoming. Recorded expenses and activity will remain.
            No external venue booking is affected.
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
              onClick={() => {
                const plan = demo.plans.find((item) => item.id === dialog.id)!;
                savePlan({
                  ...plan,
                  status: "Cancelled",
                  events: [
                    ...(plan.events ?? []),
                    event(
                      `${role === "manager" ? "Nadia" : "Akin"} cancelled the outing.`,
                    ),
                  ],
                });
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
        <Modal title="About this preview" onClose={() => setDialog(null)}>
          <h2>
            Good company.
            <br />
            Less coordination.
          </h2>
          <p className="modal-description">
            Teamfare brings outing plans, approvals, RSVPs and expenses into one
            place. This preview uses sample experiences and fictional teammates,
            with changes saved in your browser.
          </p>
          <p>
            AI research, authentication, venue bookings, invitations, payments
            and cloud services are not connected. The manager switch is for
            exploring the local workflow.
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
            Eight sample teammates. Preferences are saved here for planning;
            they are not sent to a venue.
          </p>
          <label className="field">
            Dietary preference
            <select
              value={demo.preference}
              onChange={(e) =>
                setDemo((current) => ({
                  ...current,
                  preference: e.target.value,
                }))
              }
            >
              <option>No preference</option>
              <option>Vegetarian options</option>
              <option>Vegan options</option>
              <option>Halal options</option>
            </select>
          </label>
          <div className="preference-people">
            {members.map((member) => (
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
  );
}
