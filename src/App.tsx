import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Heart,
  MapPin,
  Menu,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { Modal } from "./components/Modal";
import { Avatars, Brand } from "./components/Brand";
import { ExperienceArt } from "./components/ExperienceArt";
import { CreatePlan, ExpenseForm } from "./components/Forms";
import {
  dateLabel,
  experienceFor,
  experiences,
  initialDemo,
  loadDemo,
  localDate,
  members,
  money,
  storageKey,
} from "./data";
import type { Category, Demo, Plan, Status, View } from "./data";
import "./App.css";

type Dialog =
  | { type: "experience"; id: string }
  | { type: "plan"; id: string }
  | { type: "create"; experienceId?: string; editId?: string }
  | { type: "expense"; planId?: string }
  | { type: "cancel"; id: string }
  | { type: "people" | "about" | "reset" }
  | null;
const categories: Category[] = [
  "All experiences",
  "Good food",
  "Make something",
  "A little adventure",
];

export default function App() {
  const [demo, setDemo] = useState<Demo>(loadDemo);
  const [view, setView] = useState<View>("discover");
  const [category, setCategory] = useState<Category>("All experiences");
  const [savedOnly, setSavedOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [role, setRole] = useState<"employee" | "manager">("employee");
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const [brief, setBrief] = useState("");
  const [planFilter, setPlanFilter] = useState("Upcoming");
  const [expenseFilter, setExpenseFilter] = useState("all");
  const [storageError, setStorageError] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(demo));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [demo]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: MouseEvent) => {
      if (!profileRef.current?.contains(event.target as Node))
        setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", escape);
    };
  }, [profileOpen]);

  function navigate(next: View) {
    setView(next);
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function saveExperience(id: string) {
    setDemo((current) => ({
      ...current,
      saved: current.saved.includes(id)
        ? current.saved.filter((item) => item !== id)
        : [...current.saved, id],
    }));
  }
  function updatePlan(id: string, status: Status) {
    setDemo((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === id ? { ...plan, status } : plan,
      ),
    }));
    setToast(
      status === "Approved"
        ? "Plan approved. Your team can RSVP."
        : status === "Awaiting approval"
          ? "Sent to your manager for review."
          : status === "Cancelled"
            ? "Outing cancelled. Your records are kept."
            : "Changes requested. The organiser can edit and resubmit.",
    );
  }
  function rsvp(id: string) {
    setDemo((current) => ({
      ...current,
      plans: current.plans.map((plan) =>
        plan.id === id
          ? {
              ...plan,
              going: plan.going.includes("akin")
                ? plan.going.filter((person) => person !== "akin")
                : [...plan.going, "akin"],
            }
          : plan,
      ),
    }));
  }
  const upcoming = demo.plans
    .filter((plan) => plan.status === "Approved" && plan.date >= localDate())
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const pending = demo.plans.filter(
    (plan) => plan.status === "Awaiting approval",
  ).length;
  const activePlans = demo.plans.filter((plan) => plan.status !== "Cancelled");
  const totalBudget = activePlans.reduce(
    (total, plan) => total + plan.budget,
    0,
  );
  const totalSpent = demo.expenses
    .filter((expense) => activePlans.some((plan) => plan.id === expense.planId))
    .reduce((total, expense) => total + expense.amount, 0);
  const matches = experiences.filter(
    (experience) =>
      (category === "All experiences" || experience.category === category) &&
      (!savedOnly || demo.saved.includes(experience.id)),
  );
  const visibleExperiences =
    category === "All experiences" && !savedOnly && !showAll
      ? matches.slice(0, 3)
      : matches;
  const visiblePlans = demo.plans.filter(
    (plan) =>
      planFilter === "All plans" ||
      (planFilter === "Upcoming"
        ? plan.status === "Approved" && plan.date >= localDate()
        : planFilter === "Needs attention"
          ? ["Draft", "Awaiting approval", "Changes requested"].includes(
              plan.status,
            )
          : plan.status === "Cancelled" || plan.date < localDate()),
  );
  const visibleExpenses = demo.expenses.filter(
    (expense) => expenseFilter === "all" || expense.planId === expenseFilter,
  );

  function exportExpenses() {
    if (!visibleExpenses.length) {
      setToast("There are no expenses to export yet.");
      return;
    }
    const cell = (value: string | number) =>
      `"${String(value)
        .replace(/^[=+@\-]/, "'$&")
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
    setToast("Your expense report has been downloaded.");
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <button
          className="brand-button"
          onClick={() => navigate("discover")}
          aria-label="Teamfare home"
        >
          <Brand />
        </button>
        <nav
          className={mobileOpen ? "main-nav is-open" : "main-nav"}
          aria-label="Main navigation"
        >
          {(
            [
              ["discover", "Discover"],
              ["plans", "Our plans"],
              ["expenses", "Expenses"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={view === key ? "active" : ""}
              aria-current={view === key ? "page" : undefined}
              onClick={() => navigate(key)}
            >
              {label}
              {key === "plans" && role === "manager" && pending > 0 && (
                <span className="nav-count">{pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <span className="company-label">THE KOTO TEAM</span>
          <div className="profile-wrap" ref={profileRef}>
            <button
              className="profile-button"
              aria-label="Account and demo role"
              aria-expanded={profileOpen}
              onClick={() => setProfileOpen(!profileOpen)}
            >
              <span className="profile-avatar">
                {role === "employee" ? "AC" : "NB"}
              </span>
              <ChevronDown size={14} />
            </button>
            {profileOpen && (
              <div className="profile-menu">
                <span className="eyebrow">YOU’RE EXPLORING AS</span>
                <strong>
                  {role === "employee" ? "Akin Cole" : "Nadia Bello"}
                </strong>
                <p>
                  {role === "employee"
                    ? "Team member"
                    : "People & culture manager"}
                </p>
                <button
                  onClick={() => {
                    setRole(role === "employee" ? "manager" : "employee");
                    setProfileOpen(false);
                    setToast(
                      `Switched to the ${role === "employee" ? "manager" : "employee"} demo.`,
                    );
                  }}
                >
                  <Users size={16} />
                  Try the {role === "employee" ? "manager" : "employee"} view
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => {
                    setDialog({ type: "people" });
                    setProfileOpen(false);
                  }}
                >
                  Our people & preferences
                  <ArrowUpRight size={15} />
                </button>
                <button
                  onClick={() => {
                    setDialog({ type: "about" });
                    setProfileOpen(false);
                  }}
                >
                  About this preview
                  <ArrowUpRight size={15} />
                </button>
              </div>
            )}
          </div>
          <button
            className="mobile-menu icon-button"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={23} /> : <Menu size={23} />}
          </button>
        </div>
      </header>
      {storageError && (
        <div className="storage-warning" role="status">
          Your browser can’t save this preview. Changes will last until you
          close this page.
        </div>
      )}
      <main id="main">
        {view === "discover" && (
          <>
            <section className="hero-section page-width">
              <div className="hero-copy">
                <div className="eyebrow hero-eyebrow">
                  <span className="little-star">✳</span>GOOD THINGS HAPPEN OFF
                  THE CLOCK
                </div>
                <h1>
                  Good people.
                  <br />
                  <em>Great plans.</em>
                </h1>
                <p>
                  The best team moments don’t happen in a meeting.
                  <br className="desktop-break" /> Let’s get your people
                  together. We’ll sort the details.
                </p>
                <form
                  className="brief-composer"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setDialog({ type: "create" });
                  }}
                >
                  <label htmlFor="brief">
                    <Sparkles size={16} />A LITTLE IDEA GOES A LONG WAY
                  </label>
                  <textarea
                    id="brief"
                    rows={2}
                    value={brief}
                    onChange={(event) => setBrief(event.target.value)}
                    placeholder="Dinner for eight? An afternoon making something? Tell us what you have in mind…"
                    maxLength={500}
                  />
                  <div className="composer-bottom">
                    <span>THE PEOPLE. THE PLAN. THE PAPERWORK.</span>
                    <button
                      className="square-arrow"
                      aria-label="Plan an outing"
                      type="submit"
                    >
                      <span>Make a plan</span>
                      <ArrowUpRight size={19} />
                    </button>
                  </div>
                </form>
                <div className="hero-footnote">
                  <Avatars />
                  <span>
                    Less organising.
                    <br />
                    <strong>More “we should do this again.”</strong>
                  </span>
                </div>
              </div>
              <div className="hero-visual">
                <div className="photo-caption">
                  <span>THE TEAM THAT EATS TOGETHER…</span>
                  <span>01 / THE GOOD STUFF</span>
                </div>
                <div className="hero-photo">
                  <img
                    src="/images/together.jpg"
                    alt="Friends and colleagues catching up over a shared meal"
                    fetchPriority="high"
                  />
                  <span className="photo-note">A table for everyone.</span>
                </div>
                <div className="outing-ticket">
                  <span className="ticket-eyebrow">YOU’RE INVITED TO</span>
                  <strong>
                    less small talk.
                    <br />
                    <i>more good times.</i>
                  </strong>
                  <div className="ticket-rule" />
                  <span>
                    YOUR TEAM + SOMETHING DIFFERENT <ArrowUpRight size={20} />
                  </span>
                </div>
                <div className="round-stamp" aria-hidden="true">
                  <span>GOOD</span>
                  <svg viewBox="0 0 40 40">
                    <path d="M20 4v32M4 20h32M9 9l22 22M9 31 31 9" />
                  </svg>
                  <span>COMPANY</span>
                </div>
              </div>
            </section>
            <section
              className="up-next page-width"
              aria-label="Your next outing"
            >
              <div className="up-next-intro">
                <span className="eyebrow">SOMETHING TO LOOK FORWARD TO</span>
                <span className="hand-arrow" aria-hidden="true">
                  ↳
                </span>
              </div>
              {upcoming ? (
                <button
                  className="next-outing"
                  onClick={() => setDialog({ type: "plan", id: upcoming.id })}
                >
                  <span className="date-block">
                    <strong>
                      {dateLabel(upcoming.date, { day: "2-digit" })}
                    </strong>
                    <span>{dateLabel(upcoming.date, { month: "short" })}</span>
                  </span>
                  <span className="next-outing-name">
                    <strong>{upcoming.title}</strong>
                    <span>
                      {experienceFor(upcoming.experienceId).name} ·{" "}
                      {upcoming.time} · {upcoming.people} people
                    </span>
                  </span>
                  <Avatars ids={upcoming.attendees} small />
                  <span className="inline-link">
                    See the plan <ArrowRight size={18} />
                  </span>
                </button>
              ) : (
                <button
                  className="next-outing empty-next"
                  onClick={() => setDialog({ type: "create" })}
                >
                  <strong>Your next good memory starts with a plan.</strong>
                  <span className="inline-link">
                    Make one <ArrowRight size={18} />
                  </span>
                </button>
              )}
            </section>
            <section className="discovery-section page-width" id="experiences">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">
                    CLOSE THE LAPTOP. OPEN UP THE POSSIBILITIES.
                  </span>
                  <h2>
                    What’s your team’s <em>thing?</em>
                  </h2>
                </div>
                <p>
                  Big catch-ups. Small adventures.
                  <br />A few ideas to get everyone out there.
                </p>
              </div>
              <div className="discovery-toolbar">
                <div className="category-tabs" aria-label="Filter experiences">
                  {categories.map((item) => (
                    <button
                      key={item}
                      aria-pressed={category === item}
                      onClick={() => setCategory(item)}
                      className={category === item ? "selected" : ""}
                    >
                      {item === "All experiences" ? (
                        <Sparkles size={15} />
                      ) : item === "Good food" ? (
                        <Utensils size={15} />
                      ) : item === "Make something" ? (
                        <span className="category-mark" aria-hidden="true">
                          ✳
                        </span>
                      ) : (
                        <ArrowUpRight size={17} />
                      )}
                      {item}
                    </button>
                  ))}
                </div>
                <button
                  className={`saved-filter ${savedOnly ? "selected" : ""}`}
                  aria-label={
                    savedOnly
                      ? "Show all experiences"
                      : "Show saved experiences"
                  }
                  aria-pressed={savedOnly}
                  onClick={() => setSavedOnly(!savedOnly)}
                >
                  <Heart size={17} fill={savedOnly ? "currentColor" : "none"} />
                  <span>
                    Saved
                    {demo.saved.length > 0 ? ` (${demo.saved.length})` : ""}
                  </span>
                </button>
              </div>
              <div className="experience-grid">
                {visibleExperiences.length ? (
                  visibleExperiences.map((experience, index) => (
                    <article
                      className="experience-card"
                      key={experience.id}
                      style={{ animationDelay: `${index * 70}ms` }}
                    >
                      <div className="experience-image-wrap">
                        <button
                          className="experience-image-button"
                          onClick={() =>
                            setDialog({ type: "experience", id: experience.id })
                          }
                          aria-label={`Explore ${experience.name}`}
                        >
                          <ExperienceArt experience={experience} />
                        </button>
                        <span className="experience-label">
                          {experience.category}
                        </span>
                        <button
                          className={`save-button ${demo.saved.includes(experience.id) ? "is-saved" : ""}`}
                          aria-label={`${demo.saved.includes(experience.id) ? "Unsave" : "Save"} ${experience.name}`}
                          aria-pressed={demo.saved.includes(experience.id)}
                          onClick={() => saveExperience(experience.id)}
                        >
                          <Heart
                            size={19}
                            fill={
                              demo.saved.includes(experience.id)
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </div>
                      <div className="card-meta">
                        <span>
                          <MapPin size={13} />
                          {experience.area.split(",")[0]}
                        </span>
                        <span>{experience.duration}</span>
                      </div>
                      <button
                        className="card-title"
                        onClick={() =>
                          setDialog({ type: "experience", id: experience.id })
                        }
                      >
                        <h3>{experience.name}</h3>
                        <ArrowUpRight size={23} />
                      </button>
                      <p className="card-subtitle">{experience.subtitle}</p>
                      <div className="card-bottom">
                        <span>
                          <strong>{money(experience.price)}</strong> / person
                        </span>
                        <span>Sample experience</span>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-state">
                    <Heart size={27} />
                    <h3>A little room for favourites.</h3>
                    <p>
                      Save an experience with the heart, and you’ll find it
                      here.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        setCategory("All experiences");
                        setSavedOnly(false);
                      }}
                    >
                      Explore all experiences <ArrowRight size={16} />
                    </button>
                  </div>
                )}
              </div>
              <div className="discovery-bottom">
                <p className="sample-caption">
                  A taste of what’s possible. Sample experiences and estimated
                  prices, not bookable venue listings.
                </p>
                {category === "All experiences" && !savedOnly && !showAll && (
                  <button
                    className="text-button"
                    onClick={() => setShowAll(true)}
                  >
                    A few more ideas <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </section>
            <section className="how-section page-width">
              <div className="how-title">
                <span className="eyebrow">
                  FROM “WE SHOULD” TO “SEE YOU THERE”
                </span>
                <h2>
                  All the good bits.
                  <br />
                  <em>Less of the back-and-forth.</em>
                </h2>
                <button
                  className="text-button"
                  onClick={() => setDialog({ type: "create" })}
                >
                  Let’s make a plan <ArrowUpRight size={20} />
                </button>
              </div>
              <div className="how-steps">
                {[
                  [
                    "01",
                    "Find your kind of good.",
                    "Tell us the mood, the people, and the budget. Start with a little inspiration.",
                  ],
                  [
                    "02",
                    "Get everyone on board.",
                    "Put the plan in one place. Give your manager the details and your team something to look forward to.",
                  ],
                  [
                    "03",
                    "Keep the memories. And the receipts.",
                    "Track what was spent, who paid, and what’s left. The admin gets a proper ending, too.",
                  ],
                ].map(([number, title, text]) => (
                  <div className="how-step" key={number}>
                    <span>{number}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {view === "plans" && (
          <section className="inner-page page-width">
            <div className="page-intro">
              <div>
                <span className="eyebrow">SOMETHING GOOD ON THE CALENDAR</span>
                <h1>
                  Our <em>plans.</em>
                </h1>
                <p>
                  {role === "manager"
                    ? "A little oversight. A lot to look forward to."
                    : "From the first idea to the last “that was fun.”"}
                </p>
              </div>
              <button
                className="button button-dark"
                onClick={() => setDialog({ type: "create" })}
              >
                <Plus size={18} />
                Plan something good
              </button>
            </div>
            {role === "manager" && pending > 0 && (
              <div className="manager-notice">
                <ShieldCheck size={25} />
                <div>
                  <strong>
                    {pending} {pending === 1 ? "plan needs" : "plans need"} your
                    good-to-go.
                  </strong>
                  <p>
                    Review the people, estimated cost, and budget before
                    approving.
                  </p>
                </div>
                <button
                  className="inline-link"
                  onClick={() => setPlanFilter("Needs attention")}
                >
                  Review plans <ArrowRight size={18} />
                </button>
              </div>
            )}
            <div className="list-tabs">
              {[
                "Upcoming",
                "Needs attention",
                "Past & cancelled",
                "All plans",
              ].map((filter) => (
                <button
                  key={filter}
                  className={planFilter === filter ? "selected" : ""}
                  onClick={() => setPlanFilter(filter)}
                >
                  {filter}
                </button>
              ))}
            </div>
            <div className="plan-list">
              {visiblePlans.length ? (
                visiblePlans.map((plan) => (
                  <article className="plan-row" key={plan.id}>
                    <div className="plan-thumbnail">
                      <ExperienceArt
                        experience={experienceFor(plan.experienceId)}
                      />
                    </div>
                    <div className="plan-row-main">
                      <StatusLabel status={plan.status} />
                      <button
                        onClick={() => setDialog({ type: "plan", id: plan.id })}
                      >
                        <h2>{plan.title}</h2>
                      </button>
                      <p>
                        {experienceFor(plan.experienceId).name} ·{" "}
                        {dateLabel(plan.date)} · {plan.time}
                      </p>
                      <div className="plan-row-details">
                        <span>
                          <Users size={15} />
                          {plan.people} people
                        </span>
                        <span>
                          {money(
                            experienceFor(plan.experienceId).price *
                              plan.people,
                          )}{" "}
                          estimate
                        </span>
                        <span>{plan.going.length} going</span>
                      </div>
                    </div>
                    <button
                      className="plan-row-action icon-button"
                      aria-label={`View ${plan.title}`}
                      onClick={() => setDialog({ type: "plan", id: plan.id })}
                    >
                      <ArrowUpRight size={25} />
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <CalendarDays size={28} />
                  <h3>Good things take a first step.</h3>
                  <p>
                    No plans in this view yet. Start a new one or browse all
                    plans.
                  </p>
                  <button
                    className="button button-dark"
                    onClick={() => setDialog({ type: "create" })}
                  >
                    Plan an outing <ArrowRight size={17} />
                  </button>
                </div>
              )}
            </div>
            <div className="bottom-note">
              <Sparkles size={18} />
              <p>
                Plans and approvals are saved in this browser. Venue
                reservations and invitations aren’t sent in this preview.
              </p>
            </div>
          </section>
        )}
        {view === "expenses" && (
          <section className="inner-page page-width">
            <div className="page-intro">
              <div>
                <span className="eyebrow">GOOD TIMES. TIDY NUMBERS.</span>
                <h1>
                  The team <em>tab.</em>
                </h1>
                <p>All the little costs, without the big spreadsheet.</p>
              </div>
              <button
                className="button button-dark"
                onClick={() => setDialog({ type: "expense" })}
              >
                <Plus size={18} />
                Add an expense
              </button>
            </div>
            <div className="expense-summary">
              <div>
                <span className="eyebrow">PLANNED BUDGET</span>
                <strong>{money(totalBudget)}</strong>
                <span>Across {activePlans.length} active outings</span>
              </div>
              <div>
                <span className="eyebrow">RECORDED SPEND</span>
                <strong>{money(totalSpent)}</strong>
                <span>For active outings</span>
              </div>
              <div>
                <span className="eyebrow">BUDGET BALANCE</span>
                <strong
                  className={totalBudget - totalSpent < 0 ? "over-budget" : ""}
                >
                  {money(totalBudget - totalSpent)}
                </strong>
                <span>
                  {totalBudget - totalSpent < 0
                    ? "Over planned budget"
                    : "Available across active outings"}
                </span>
              </div>
            </div>
            <div className="expenses-toolbar">
              <label>
                <SlidersHorizontal size={16} />
                <select
                  aria-label="Filter expenses by outing"
                  value={expenseFilter}
                  onChange={(event) => setExpenseFilter(event.target.value)}
                >
                  <option value="all">All outings</option>
                  {demo.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title}
                    </option>
                  ))}
                </select>
              </label>
              <button className="text-button" onClick={exportExpenses}>
                <ArrowDownToLine size={16} />
                Export CSV
              </button>
            </div>
            <div className="table-scroll">
              <table className="expenses-table">
                <thead>
                  <tr>
                    <th>THE LITTLE DETAILS</th>
                    <th>OUTING</th>
                    <th>PAID BY</th>
                    <th>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td>
                        <strong>{expense.description}</strong>
                        <span>
                          {dateLabel(expense.date)} · {expense.category}
                        </span>
                      </td>
                      <td>
                        {
                          demo.plans.find((plan) => plan.id === expense.planId)
                            ?.title
                        }
                      </td>
                      <td>{expense.payer}</td>
                      <td>{money(expense.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleExpenses.length && (
                <div className="empty-state">
                  <h3>A clean slate.</h3>
                  <p>Add your first expense, or choose another outing.</p>
                </div>
              )}
            </div>
            <div className="bottom-note">
              <CheckCheck size={19} />
              <p>
                Real calculations. Downloadable reports. This preview records
                expenses locally; it doesn’t charge cards or issue
                reimbursements.
              </p>
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer page-width">
        <Brand />
        <p>A little less admin. A little more together.</p>
        <button onClick={() => setDialog({ type: "about" })}>
          Made for good company <ArrowUpRight size={15} />
        </button>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {dialog?.type === "experience" &&
        (() => {
          const experience = experienceFor(dialog.id);
          return (
            <Modal title="A CLOSER LOOK" onClose={() => setDialog(null)} wide>
              <div className="experience-detail">
                <ExperienceArt experience={experience} />
                <div>
                  <span className="eyebrow">
                    {experience.category.toUpperCase()} / SAMPLE EXPERIENCE
                  </span>
                  <h2>{experience.name}</h2>
                  <p>{experience.description}</p>
                  <div className="detail-facts">
                    <span>
                      <MapPin size={16} />
                      {experience.area}
                    </span>
                    <span>
                      <Clock3 size={16} />
                      {experience.duration}
                    </span>
                    <span>
                      <Users size={16} />
                      Up to {experience.capacity} people
                    </span>
                  </div>
                  <h3>The good stuff, included</h3>
                  <ul className="check-list">
                    {experience.includes.map((item) => (
                      <li key={item}>
                        <Check size={15} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <div className="detail-bottom">
                    <span>
                      <strong>{money(experience.price)}</strong> / person,
                      estimated
                    </span>
                    <button
                      className="button button-dark"
                      onClick={() =>
                        setDialog({
                          type: "create",
                          experienceId: experience.id,
                        })
                      }
                    >
                      Make it our plan <ArrowUpRight size={17} />
                    </button>
                  </div>
                </div>
              </div>
            </Modal>
          );
        })()}
      {dialog?.type === "create" && (
        <CreatePlan
          initialExperienceId={dialog.experienceId}
          existing={demo.plans.find((plan) => plan.id === dialog.editId)}
          brief={brief}
          onClose={() => setDialog(null)}
          onCreate={(plan) => {
            setDemo((current) => ({
              ...current,
              plans: current.plans.some((item) => item.id === plan.id)
                ? current.plans.map((item) =>
                    item.id === plan.id ? plan : item,
                  )
                : [plan, ...current.plans],
            }));
            setDialog({ type: "plan", id: plan.id });
            setBrief("");
            setToast("A little idea, now a real plan.");
          }}
        />
      )}
      {dialog?.type === "plan" &&
        (() => {
          const plan = demo.plans.find((item) => item.id === dialog.id);
          if (!plan) return null;
          return (
            <PlanDetail
              plan={plan}
              expensesTotal={demo.expenses
                .filter((expense) => expense.planId === plan.id)
                .reduce((sum, expense) => sum + expense.amount, 0)}
              role={role}
              onClose={() => setDialog(null)}
              onStatus={(status) => updatePlan(plan.id, status)}
              onRSVP={() => rsvp(plan.id)}
              onEdit={() => setDialog({ type: "create", editId: plan.id })}
              onExpense={() => setDialog({ type: "expense", planId: plan.id })}
              onCancel={() => setDialog({ type: "cancel", id: plan.id })}
            />
          );
        })()}
      {dialog?.type === "expense" && (
        <ExpenseForm
          plans={demo.plans}
          defaultPlanId={dialog.planId}
          onClose={() => setDialog(null)}
          onSubmit={(expense) => {
            setDemo((current) => ({
              ...current,
              expenses: [expense, ...current.expenses],
            }));
            setDialog(null);
            navigate("expenses");
            setToast("Expense recorded. The tab is up to date.");
          }}
        />
      )}
      {dialog?.type === "cancel" && (
        <Modal title="CANCEL THIS OUTING" onClose={() => setDialog(null)}>
          <h2>
            A change of <em>plans.</em>
          </h2>
          <p className="modal-description">
            Cancel this sample outing? Existing expense records will be kept. No
            messages or refunds are sent from the preview.
          </p>
          <div className="form-actions">
            <button
              className="button button-outline"
              onClick={() => setDialog(null)}
            >
              Keep the outing
            </button>
            <button
              className="button button-dark"
              onClick={() => {
                updatePlan(dialog.id, "Cancelled");
                setDialog(null);
              }}
            >
              Cancel outing
            </button>
          </div>
        </Modal>
      )}
      {dialog?.type === "people" && (
        <Modal title="OUR PEOPLE" onClose={() => setDialog(null)}>
          <h2>
            Good company,
            <br />
            <em>all accounted for.</em>
          </h2>
          <p className="modal-description">
            Eight sample teammates. Plenty of different ideas of a good time.
          </p>
          <div className="people-list">
            {members.map((member) => (
              <div key={member.id}>
                <span className="avatar" style={{ background: member.color }}>
                  {member.initials}
                </span>
                <div>
                  <strong>{member.name}</strong>
                  <span>{member.team}</span>
                </div>
                {member.id === "akin" && <span className="you-label">YOU</span>}
              </div>
            ))}
          </div>
          <label className="field">
            Akin’s dining preference
            <select
              value={demo.preference}
              onChange={(event) =>
                setDemo((current) => ({
                  ...current,
                  preference: event.target.value,
                }))
              }
            >
              {[
                "No preference",
                "Vegetarian",
                "Vegan",
                "Halal",
                "Pescatarian",
              ].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <p className="field-help">
            Saved for this preview. Preferences still need confirmation with any
            real venue.
          </p>
        </Modal>
      )}
      {dialog?.type === "about" && (
        <Modal
          title="A NOTE ABOUT THIS PREVIEW"
          onClose={() => setDialog(null)}
        >
          <span className="big-asterisk" aria-hidden="true">
            ✳
          </span>
          <h2>
            Good things
            <br />
            <em>start somewhere.</em>
          </h2>
          <p className="modal-description">
            This is Teamfare’s interactive product preview. Explore sample
            experiences, create an outing, try manager approvals, RSVP, record
            expenses, and download a CSV.
          </p>
          <p className="modal-description">
            Your changes are stored in this browser. Venue discovery uses a
            sample catalogue; no AI service, live availability, bookings,
            emails, or payments are connected yet.
          </p>
          <button
            className="button button-outline"
            onClick={() => setDialog({ type: "reset" })}
          >
            Reset sample data <ArrowRight size={17} />
          </button>
        </Modal>
      )}
      {dialog?.type === "reset" && (
        <Modal title="START FRESH" onClose={() => setDialog(null)}>
          <h2>
            A fresh <em>page.</em>
          </h2>
          <p className="modal-description">
            Reset the preview to its original sample plans, expenses, and
            favourites? This removes changes you’ve made in this browser.
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
                setDialog(null);
                setToast("Back to the beginning. Make something good.");
              }}
            >
              Reset preview
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
function StatusLabel({ status }: { status: Status }) {
  return (
    <span
      className={`status-label status-${status.toLowerCase().replaceAll(" ", "-")}`}
    >
      <span />
      {status}
    </span>
  );
}
function PlanDetail({
  plan,
  expensesTotal,
  role,
  onClose,
  onStatus,
  onRSVP,
  onEdit,
  onExpense,
  onCancel,
}: {
  plan: Plan;
  expensesTotal: number;
  role: string;
  onClose: () => void;
  onStatus: (status: Status) => void;
  onRSVP: () => void;
  onEdit: () => void;
  onExpense: () => void;
  onCancel: () => void;
}) {
  const experience = experienceFor(plan.experienceId),
    estimate = experience.price * plan.people;
  return (
    <Modal title="THE PLAN" onClose={onClose} wide>
      <div className="plan-detail-heading">
        <div>
          <StatusLabel status={plan.status} />
          <h2>{plan.title}</h2>
          <p>
            {experience.name} · {experience.area}
          </p>
        </div>
        <span className="date-block">
          <strong>{dateLabel(plan.date, { day: "2-digit" })}</strong>
          <span>{dateLabel(plan.date, { month: "short" })}</span>
        </span>
      </div>
      <div className="plan-detail-body">
        <div>
          <div className="detail-facts">
            <span>
              <CalendarDays size={17} />
              {dateLabel(plan.date, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <span>
              <Clock3 size={17} />
              {plan.time} · {experience.duration}
            </span>
            <span>
              <Users size={17} />
              {plan.people} people
            </span>
          </div>
          <h3>A note for the team</h3>
          <p className="plan-note">
            {plan.note || "Come as you are. Leave the laptop behind."}
          </p>
          <h3>
            The guest list{" "}
            <span className="muted">/ {plan.going.length} going</span>
          </h3>
          <div className="guest-list">
            {plan.attendees.map((id) => {
              const member = members.find((person) => person.id === id)!;
              return (
                <div key={id}>
                  <span className="avatar" style={{ background: member.color }}>
                    {member.initials}
                  </span>
                  <span>{member.name}</span>
                  {plan.going.includes(id) ? (
                    <span className="guest-rsvp">
                      <Check size={13} />
                      Going
                    </span>
                  ) : (
                    <span className="muted">Invited</span>
                  )}
                </div>
              );
            })}
          </div>
          {plan.people > plan.attendees.length && (
            <p className="field-help">
              {plan.people - plan.attendees.length} additional guest places
              planned.
            </p>
          )}
          {plan.status === "Approved" &&
            plan.attendees.includes("akin") &&
            role === "employee" && (
              <button
                className={`button ${plan.going.includes("akin") ? "button-outline" : "button-dark"}`}
                onClick={onRSVP}
              >
                {plan.going.includes("akin") ? "Change my RSVP" : "Count me in"}
                <Check size={17} />
              </button>
            )}
        </div>
        <aside className="plan-budget">
          <span className="eyebrow">LET’S KEEP THE TAB TIDY</span>
          <h3>The numbers.</h3>
          <dl>
            <div>
              <dt>Estimated experience</dt>
              <dd>{money(estimate)}</dd>
            </div>
            <div>
              <dt>Planned budget</dt>
              <dd>{money(plan.budget)}</dd>
            </div>
            <div>
              <dt>Recorded expenses</dt>
              <dd>{money(expensesTotal)}</dd>
            </div>
            <div
              className={
                plan.budget < estimate ? "over-budget" : "budget-remainder"
              }
            >
              <dt>
                {plan.budget < estimate
                  ? "Above budget by"
                  : "Room in the budget"}
              </dt>
              <dd>{money(Math.abs(plan.budget - estimate))}</dd>
            </div>
          </dl>
          <p>
            Estimates are planning figures. Your team’s actual costs may change.
          </p>
          {plan.status === "Awaiting approval" && role === "manager" && (
            <div className="stack-buttons">
              <button
                className="button button-dark"
                disabled={estimate > plan.budget}
                onClick={() => onStatus("Approved")}
              >
                Give it the go-ahead <Check size={16} />
              </button>
              {estimate > plan.budget && (
                <p className="error-text">
                  The estimate exceeds this budget. Request changes before
                  approving.
                </p>
              )}
              <button
                className="button button-outline"
                onClick={() => onStatus("Changes requested")}
              >
                Request changes
              </button>
            </div>
          )}
          {["Draft", "Changes requested"].includes(plan.status) && (
            <>
              <button className="button button-dark" onClick={onEdit}>
                Edit the details <ArrowUpRight size={16} />
              </button>
              <button
                className="button button-outline"
                disabled={plan.budget < estimate}
                onClick={() => onStatus("Awaiting approval")}
              >
                Send for approval <ArrowRight size={16} />
              </button>
            </>
          )}
          {plan.status === "Awaiting approval" && role === "employee" && (
            <p className="waiting-note">
              <Clock3 size={17} />
              With Nadia for review. Try the manager view from your profile.
            </p>
          )}
          {plan.status === "Approved" && (
            <button className="button button-outline" onClick={onExpense}>
              <Plus size={16} />
              Record an expense
            </button>
          )}
          {plan.status !== "Cancelled" && (
            <button className="cancel-plan" onClick={onCancel}>
              Cancel this outing
            </button>
          )}
        </aside>
      </div>
      <div className="dialog-footnote">
        Sample plan · RSVPs and approvals stay in this browser. No invitations
        or venue bookings are sent.
      </div>
    </Modal>
  );
}
