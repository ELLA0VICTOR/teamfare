import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Bookmark, ChevronDown, Plus } from "lucide-react";
import { dateLabel, experiences, localDate, money } from "../data";
import type { Category, Demo, Experience } from "../data";
import { needsYou, placeFor } from "../plan";
import type { Role } from "../plan";
import { ExperienceArt } from "./ExperienceArt";
import { useTeam } from "../team-context";

export type ComposerValues = {
  brief: string;
  people: number;
  location: string;
  date: string;
  perPerson: number;
};
const categories: (Category | "Saved")[] = [
  "All experiences",
  "Good food",
  "Make something",
  "A little adventure",
  "Saved",
];

export function Home({
  demo,
  role,
  onStart,
  onSaveIdea,
  onExplore,
}: {
  demo: Demo;
  role: Role;
  onStart: (values: ComposerValues, experienceId?: string) => void;
  onSaveIdea: (id: string) => void;
  onExplore: (experience: Experience) => void;
}) {
  const { live, viewerId } = useTeam();
  const [brief, setBrief] = useState("");
  const [people, setPeople] = useState("8");
  const [location, setLocation] = useState("Lagos");
  const [date, setDate] = useState(localDate(8));
  const [perPerson, setPerPerson] = useState<number | "">(25000);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [category, setCategory] = useState<Category | "Saved">(
    "All experiences",
  );
  const urgent = demo.plans
    .filter((plan) => needsYou(plan, role, live ? viewerId : "akin"))
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  const upcoming = demo.plans
    .filter(
      (plan) =>
        ["Approved", "Awaiting approval"].includes(plan.status) &&
        !plan.settledAt &&
        plan.date >= localDate(),
    )
    .sort(
      (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time),
    );
  const nextPlan = urgent[0] ?? upcoming[0];
  const nextExperience =
    experiences.find((item) => item.id === nextPlan?.experienceId) ??
    experiences[0];
  const isYourMove = nextPlan
    ? needsYou(nextPlan, role, live ? viewerId : "akin")
    : false;
  const nextLabel = !nextPlan
    ? "Plan this"
    : !isYourMove
      ? "View plan"
      : nextPlan.status === "Approved"
        ? "RSVP"
        : nextPlan.status === "Awaiting approval"
          ? "Review and approve"
          : "Update plan";
  const nextStatus = !nextPlan
    ? "An idea for your team"
    : !isYourMove
      ? nextPlan.status
      : nextPlan.status === "Approved"
        ? "Your RSVP is open"
        : nextPlan.status === "Awaiting approval"
          ? "For your approval"
          : nextPlan.status === "Changes requested"
            ? "Changes requested"
            : "Draft to finish";
  const ideas = experiences.filter(
    (item) =>
      category === "All experiences" ||
      (category === "Saved"
        ? demo.saved.includes(item.id)
        : item.category === category),
  );
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    onStart({
      brief,
      people: Number(people),
      location,
      date,
      perPerson: Number(perPerson),
    });
  }
  return (
    <>
      <section className="home-hero">
        <div className="hero-main">
          <h1>
            Bring your
            <br className="desktop-break" /> team together.
          </h1>
          <p className="hero-subtitle">Leave the admin to us.</p>
          <form
            className="composer"
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.requestSubmit();
              }
            }}
          >
            <label className="composer-label" htmlFor="outing-brief">
              What do you have in mind?
            </label>
            <textarea
              id="outing-brief"
              aria-label="Describe the outing"
              placeholder="A long lunch, a little adventure, or an afternoon away from our screens…"
              maxLength={500}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              rows={3}
            />
            <button
              className="details-toggle"
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              aria-expanded={detailsOpen}
              aria-controls="composer-details"
            >
              <Plus size={16} />
              {detailsOpen ? "Hide details" : "Add details"}
              <span>
                {people || 0} people · {money(Number(perPerson))} per person
              </span>
              <ChevronDown size={16} />
            </button>
            <div
              id="composer-details"
              className={`composer-fields ${detailsOpen ? "expanded" : ""}`}
            >
              <label className="field">
                People
                <input
                  required
                  type="number"
                  min={2}
                  max={20}
                  step={1}
                  value={people}
                  onChange={(e) => setPeople(e.target.value)}
                />
              </label>
              <label className="field">
                Where
                <input
                  required
                  maxLength={100}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
              <label className="field">
                Roughly when
                <input
                  required
                  type="date"
                  min={localDate()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
              <label className="field">
                Budget per person (₦)
                <input
                  required
                  type="text"
                  inputMode="numeric"
                  value={
                    perPerson === "" ? "" : perPerson.toLocaleString("en-NG")
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replaceAll(",", "");
                    if (!/^\d*$/.test(raw)) return;
                    const amount = raw === "" ? "" : Number(raw);
                    e.target.setCustomValidity(
                      amount !== "" && (amount < 1 || amount > 5000000)
                        ? "Enter a budget from 1 to 5,000,000 naira per person."
                        : "",
                    );
                    setPerPerson(amount);
                  }}
                />
              </label>
            </div>
            <div className="composer-actions">
              <button type="submit" className="button button-dark">
                Start a plan
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
          <p className="field-help composer-note">
            Start with a sample experience. AI research, booking and invitations
            aren’t connected yet.
          </p>
        </div>
        <aside className="next-up" aria-labelledby="next-up-heading">
          <span className="eyebrow" id="next-up-heading">
            {nextPlan ? "Next up" : "A place to start"}
          </span>
          <div className="next-up-image">
            <ExperienceArt experience={nextExperience} />
          </div>
          <span
            className={`status-text ${isYourMove ? "needs-action" : nextPlan?.status === "Approved" ? "is-approved" : ""}`}
          >
            <i />
            {nextStatus}
          </span>
          <h2>
            {nextPlan ? (
              <a href={`#plan/${nextPlan.id}`}>{nextPlan.title}</a>
            ) : (
              <button onClick={() => onExplore(nextExperience)}>
                {nextExperience.name}
              </button>
            )}
          </h2>
          <p className="next-up-meta">
            {nextPlan
              ? `${dateLabel(nextPlan.date, { weekday: "short", day: "numeric", month: "short" })} · ${placeFor(nextPlan)} · ${nextPlan.people} people`
              : `${nextExperience.area} · ${nextExperience.duration}`}
          </p>
          {!nextPlan && (
            <p className="next-up-price">
              {money(nextExperience.price)} per person
            </p>
          )}
          {nextPlan ? (
            <a href={`#plan/${nextPlan.id}`} className="button button-outline">
              {nextLabel}
              <ArrowRight size={16} />
            </a>
          ) : (
            <button
              className="button button-outline"
              onClick={() =>
                onStart(
                  {
                    brief: "",
                    people: 8,
                    location: nextExperience.area,
                    date: localDate(8),
                    perPerson: nextExperience.price + 2500,
                  },
                  nextExperience.id,
                )
              }
            >
              Plan this
              <ArrowRight size={16} />
            </button>
          )}
          {urgent.length > 1 && (
            <a className="next-up-more" href="#plans?needs-you">
              {urgent.length - 1} more{" "}
              {urgent.length - 1 === 1 ? "needs" : "need"} you
              <ArrowRight size={15} />
            </a>
          )}
        </aside>
      </section>
      <section className="ideas-section" aria-labelledby="ideas-heading">
        <div className="section-heading ideas-heading">
          <div>
            <span className="eyebrow">A place to start</span>
            <h2 id="ideas-heading">Ideas for the team</h2>
          </div>
        </div>
        <div className="text-tabs" role="group" aria-label="Filter experiences">
          {categories.map((item) => (
            <button
              key={item}
              className={category === item ? "active" : ""}
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
            >
              {item === "All experiences" ? "All" : item}
              {item === "Saved" && <Bookmark size={14} />}
            </button>
          ))}
        </div>
        <div className="experience-grid">
          {ideas.map((experience) => {
            const saved = demo.saved.includes(experience.id);
            return (
              <article className="experience-card" key={experience.id}>
                <button
                  className="experience-visual"
                  onClick={() => onExplore(experience)}
                  aria-label={`Explore ${experience.name}`}
                >
                  <ExperienceArt experience={experience} />
                  <span className="image-corner">
                    <ArrowRight size={20} />
                  </span>
                </button>
                <div className="experience-title">
                  <h3>
                    <button onClick={() => onExplore(experience)}>
                      {experience.name}
                    </button>
                  </h3>
                  <button
                    className="save-button"
                    aria-label={`${saved ? "Unsave" : "Save"} ${experience.name}`}
                    aria-pressed={saved}
                    onClick={() => onSaveIdea(experience.id)}
                  >
                    <Bookmark
                      size={15}
                      fill={saved ? "currentColor" : "none"}
                    />
                    {saved ? "Saved" : "Save"}
                  </button>
                </div>
                <p>
                  {experience.area} · {experience.duration}
                </p>
                <div className="experience-bottom">
                  <span>
                    <strong>{money(experience.price)}</strong> per person
                  </span>
                  <button
                    className="text-button"
                    aria-label={`Plan ${experience.name}`}
                    onClick={() =>
                      onStart(
                        {
                          brief: "",
                          people: 8,
                          location: experience.area,
                          date: localDate(8),
                          perPerson: experience.price + 2500,
                        },
                        experience.id,
                      )
                    }
                  >
                    Plan this
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        {!ideas.length && (
          <div className="empty-state">
            <Bookmark size={32} strokeWidth={1} />
            <h3>Keep a good idea for later.</h3>
            <p>Save an experience and you’ll find it here.</p>
            <button
              className="text-button"
              onClick={() => setCategory("All experiences")}
            >
              Browse all ideas
              <ArrowRight size={16} />
            </button>
          </div>
        )}
        <p className="field-help ideas-caveat">
          Sample experiences · estimated per-person prices · venue availability
          is not verified.
        </p>
      </section>
    </>
  );
}
