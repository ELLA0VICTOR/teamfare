import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  MapPin,
  Users,
} from "lucide-react";
import {
  dateLabel,
  experienceFor,
  experiences,
  localDate,
  money,
} from "../data";
import type { Expense, Plan } from "../data";
import { event, needsYou, placeFor, priceFor } from "../plan";
import type { Role } from "../plan";
import { useTeam } from "../team-context";
import { RouteLine } from "./RouteLine";
import { ExpenseLedger } from "./ExpenseLedger";

export function PlanSheet({
  plan,
  expenses,
  role,
  onSave,
  onRsvp,
  onExpense,
  onCancel,
  announce,
}: {
  plan: Plan;
  expenses: Expense[];
  role: Role;
  onSave: (plan: Plan) => void | boolean | Promise<boolean>;
  onRsvp: (going: boolean) => void;
  onExpense: () => void;
  onCancel: () => void;
  announce: (text: string) => void;
}) {
  const { live, viewerId, viewerName, managerName, members } = useTeam();
  const actor = live ? viewerName : role === "manager" ? "Nadia" : "Akin";
  const managerLabel = live ? managerName : "Nadia";
  const creatorName =
    members.find((member) => member.id === plan.createdBy)?.name ?? "Akin Cole";
  const editable =
    (live ? plan.createdBy === viewerId : role === "employee") &&
    ["Draft", "Changes requested"].includes(plan.status);
  const review =
    role === "manager" &&
    plan.status === "Awaiting approval" &&
    (!live || plan.createdBy !== viewerId);
  const [values, setValues] = useState(() => ({
    ...plan,
    location: placeFor(plan),
  }));
  const [requesting, setRequesting] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState("");
  const shown = editable ? values : plan;
  const experience = experienceFor(shown.experienceId);
  const unitPrice = priceFor(shown);
  const total = unitPrice * shown.people;
  const difference = shown.budget - total;
  const spent = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const isGoing = plan.going.includes(live ? viewerId : "akin"),
    declined = plan.declined?.includes(live ? viewerId : "akin");
  function change<K extends keyof Plan>(key: K, value: Plan[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const status =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ===
      "draft"
        ? "Draft"
        : "Awaiting approval";
    if (
      !values.title.trim() ||
      !values.date ||
      values.date < localDate() ||
      !values.time ||
      !values.location?.trim() ||
      !Number.isInteger(values.people) ||
      values.people < 2 ||
      values.people > experience.capacity ||
      !Number.isSafeInteger(values.budget) ||
      values.budget < 0 ||
      values.budget > 100000000
    ) {
      setError(
        `Check the name, place, date, budget, and group size (2–${experience.capacity} people).`,
      );
      return;
    }
    if (status === "Awaiting approval" && difference < 0) {
      setError(
        "The estimate is above your budget. Adjust the budget or save a draft.",
      );
      return;
    }
    const attendees = live
      ? values.attendees
      : members
          .slice(0, Math.min(values.people, members.length))
          .map((member) => member.id);
    if (
      live &&
      (attendees.length > values.people || !attendees.includes(viewerId))
    ) {
      setError(
        "Choose no more teammates than the headcount, and include yourself.",
      );
      return;
    }
    const saved = await onSave({
      ...values,
      title: values.title.trim(),
      location: values.location!.trim(),
      status,
      attendees,
      going: plan.going.filter((id) => attendees.includes(id)),
      declined: (plan.declined ?? []).filter((id) => attendees.includes(id)),
      events: [
        ...(plan.events ?? []),
        event(
          status === "Draft"
            ? `${actor} saved the draft.`
            : `${actor} sent the plan to ${managerLabel} for approval.`,
        ),
      ],
    });
    if (saved === false) return;
    announce(
      status === "Draft"
        ? "Draft saved."
        : `Sent to ${managerLabel} for approval.`,
    );
  }
  async function approve() {
    if (total > plan.budget) return;
    const saved = await onSave({
      ...plan,
      status: "Approved",
      events: [
        ...(plan.events ?? []),
        event(`${actor} approved the plan. No invitations were sent.`),
      ],
    });
    if (saved === false) return;
    announce("Plan approved. Invitations have not been sent.");
  }
  async function request(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reviewNote.trim()) {
      setError("Add a note so the organiser knows what to change.");
      return;
    }
    const saved = await onSave({
      ...plan,
      status: "Changes requested",
      reviewNote: reviewNote.trim(),
      events: [
        ...(plan.events ?? []),
        event(`${actor} requested changes: ${reviewNote.trim()}`),
      ],
    });
    if (saved === false) return;
    announce("Changes requested. Your note is saved with the plan.");
    setRequesting(false);
    setError("");
  }
  const missing =
    !shown.title.trim() ||
    !shown.date ||
    !shown.time ||
    !placeFor(shown).trim() ||
    shown.people < 2;
  return (
    <div className="plan-sheet">
      <a href="#plans" className="back-link">
        <ArrowLeft size={16} />
        All plans
      </a>
      {review && (
        <section className="review-strip" aria-labelledby="review-heading">
          <div className="review-heading">
            <span className="attention-marker" />
            <h2 id="review-heading">For your approval</h2>
            <span>Proposed by {creatorName}</span>
          </div>
          <dl className="review-facts">
            <div>
              <dt>When</dt>
              <dd>
                {dateLabel(plan.date)} · {plan.time}
              </dd>
            </div>
            <div>
              <dt>People</dt>
              <dd>{plan.people} teammates</dd>
            </div>
            <div>
              <dt>Estimated cost</dt>
              <dd>
                {money(total)} total
                <small>{money(unitPrice)} per person</small>
              </dd>
            </div>
            <div>
              <dt>Against budget</dt>
              <dd className={difference < 0 ? "error-text" : ""}>
                {money(Math.abs(difference))}{" "}
                {difference >= 0 ? "under" : "over"}
                <small>{money(plan.budget)} total budget</small>
              </dd>
            </div>
          </dl>
          <div className="review-actions">
            <button
              className="button button-dark"
              onClick={approve}
              disabled={difference < 0}
            >
              Approve
              <Check size={17} />
            </button>
            <button
              className="button button-outline"
              onClick={() => {
                setRequesting(!requesting);
                setError("");
              }}
              aria-expanded={requesting}
            >
              Request changes
            </button>
            <p className="field-help">
              Approval records a decision here. Invitations are not sent in this
              preview.
            </p>
          </div>
          {difference < 0 && (
            <p className="form-error">
              This proposal is over budget. Request a correction before
              approving.
            </p>
          )}
          {requesting && (
            <form className="review-note-form" onSubmit={request}>
              <label className="field">
                What needs to change?
                <textarea
                  required
                  autoFocus
                  rows={3}
                  maxLength={500}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Give the organiser a clear next step."
                />
              </label>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              <button className="button button-dark" type="submit">
                Send back with note
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </section>
      )}
      <header className="sheet-heading">
        <div className="sheet-kicker">
          The plan sheet
          <span
            className={`status-text ${needsYou(plan, role, live ? viewerId : "akin") ? "needs-action" : plan.status === "Approved" ? "is-approved" : ""}`}
          >
            <i />
            {plan.settledAt ? "Settled" : plan.status}
          </span>
        </div>
        <h1>{plan.title}</h1>
        <div className="sheet-meta">
          <span>
            <CalendarDays size={16} />
            {dateLabel(shown.date, {
              weekday: "short",
              day: "numeric",
              month: "long",
            })}{" "}
            · {shown.time}
          </span>
          <span>
            <MapPin size={16} />
            {placeFor(shown)}
          </span>
          <span>
            <Users size={16} />
            {shown.people} people
          </span>
        </div>
        <RouteLine plan={plan} />
        <p className="status-sentence">
          {plan.status === "Awaiting approval"
            ? `Waiting for ${live ? managerName : "Nadia Bello"} to approve.`
            : plan.status === "Changes requested"
              ? `${managerLabel} requested changes. Update the draft and send it back.`
              : plan.status === "Draft"
                ? "Your idea is taking shape. Refine the details before review."
                : plan.status === "Cancelled"
                  ? "This outing was cancelled. Its expense records are kept."
                  : plan.settledAt
                    ? "Expense recording is complete. The final record is kept here."
                    : "Approved. Your team can RSVP here; invitations have not been sent."}
        </p>
      </header>
      <div className="sheet-layout">
        <div className="sheet-main">
          {plan.reviewNote && (
            <aside
              className={`pinned-note ${plan.status === "Changes requested" && role === "employee" ? "" : "note-reference"}`}
            >
              <span className="attention-marker" />
              <div>
                <strong>
                  {plan.status === "Changes requested"
                    ? `Changes from ${managerLabel}`
                    : `Last review note from ${managerLabel}`}
                </strong>
                <p>{plan.reviewNote}</p>
              </div>
            </aside>
          )}
          {editable && (
            <section className="sheet-section">
              <div className="section-heading">
                <h2>Shape the plan</h2>
                <span>Draft details</span>
              </div>
              <form id="plan-editor" onSubmit={save}>
                <div className="form-grid">
                  <label className="field field-full">
                    Outing name
                    <input
                      required
                      maxLength={80}
                      value={values.title}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  </label>
                  <label className="field field-full">
                    Experience
                    <select
                      value={values.experienceId}
                      onChange={(e) => {
                        const next = experienceFor(e.target.value);
                        setValues((current) => ({
                          ...current,
                          experienceId: next.id,
                          location: next.area,
                          unitPrice: next.price,
                        }));
                      }}
                    >
                      {experiences.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field field-full">
                    Where
                    <input
                      required
                      value={values.location ?? experience.area}
                      onChange={(e) => change("location", e.target.value)}
                      maxLength={100}
                    />
                  </label>
                  <label className="field">
                    Date
                    <input
                      required
                      type="date"
                      min={localDate()}
                      value={values.date}
                      onChange={(e) => change("date", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    Time
                    <input
                      required
                      type="time"
                      value={values.time}
                      onChange={(e) => change("time", e.target.value)}
                    />
                  </label>
                  <label className="field">
                    People
                    <input
                      required
                      type="number"
                      min={2}
                      max={experience.capacity}
                      step={1}
                      aria-label="People"
                      aria-describedby="people-limit"
                      value={values.people || ""}
                      onChange={(e) => change("people", Number(e.target.value))}
                    />
                    <span className="field-help" id="people-limit">
                      Up to {experience.capacity} for this experience.
                    </span>
                  </label>
                  <label className="field">
                    Total budget (NGN)
                    <input
                      required
                      type="number"
                      min={0}
                      max={100000000}
                      step={1}
                      value={values.budget}
                      onChange={(e) => change("budget", Number(e.target.value))}
                    />
                  </label>
                  <label className="field field-full">
                    Note for the team
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={values.note}
                      onChange={(e) => change("note", e.target.value)}
                    />
                  </label>
                </div>
                {live && (
                  <fieldset className="guest-picker">
                    <legend>Who is invited?</legend>
                    <p className="field-help">
                      Choose teammates for the guest list. No invitations are
                      emailed yet.
                    </p>
                    {members.map((member) => (
                      <label key={member.id}>
                        <input
                          type="checkbox"
                          checked={values.attendees.includes(member.id)}
                          disabled={member.id === viewerId}
                          onChange={(e) =>
                            change(
                              "attendees",
                              e.target.checked
                                ? [...values.attendees, member.id]
                                : values.attendees.filter(
                                    (id) => id !== member.id,
                                  ),
                            )
                          }
                        />
                        {member.name}
                        {member.id === viewerId ? " (you)" : ""}
                      </label>
                    ))}
                  </fieldset>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <div className="editor-bottom">
                  <button
                    className="button button-outline"
                    type="submit"
                    value="draft"
                  >
                    Save draft
                  </button>
                  <p className="field-help">
                    Changes are saved when you save the draft or send for
                    approval.
                  </p>
                </div>
              </form>
            </section>
          )}
          <section className="sheet-section">
            <div className="section-heading">
              <h2>The outing</h2>
              <span>{experience.duration}</span>
            </div>
            <div className="itinerary-row">
              <span className="itinerary-time">{shown.time}</span>
              <div>
                <h3>{experience.name}</h3>
                <p>{placeFor(shown)}</p>
                <p className="field-help">{experience.includes[0]}</p>
              </div>
              <span className="amount">
                {money(total)}
                <small>estimated total</small>
              </span>
            </div>
            {!editable && plan.note && (
              <p className="outing-note">{plan.note}</p>
            )}
            <p className="field-help section-footnote">
              Sample experience and estimated prices. Venue availability and
              booking are not connected.
            </p>
          </section>
          <section className="sheet-section">
            <div className="section-heading">
              <h2>The cost</h2>
              <span>Estimated · NGN</span>
            </div>
            <dl className="cost-ledger">
              <div>
                <dt>
                  {experience.name}
                  <small>
                    {money(unitPrice)} per person × {shown.people}
                  </small>
                </dt>
                <dd>{money(total)} total</dd>
              </div>
              <div className="ledger-total">
                <dt>Estimated total</dt>
                <dd>
                  {money(total)}
                  <small>
                    {money(shown.people ? total / shown.people : 0)} per person
                  </small>
                </dd>
              </div>
              <div>
                <dt>Total budget</dt>
                <dd>{money(shown.budget)}</dd>
              </div>
              <div className={difference < 0 ? "error-text" : ""}>
                <dt>
                  {difference >= 0 ? "Remaining in budget" : "Over budget"}
                </dt>
                <dd>{money(Math.abs(difference))}</dd>
              </div>
              {expenses.length > 0 && (
                <div>
                  <dt>Expenses recorded</dt>
                  <dd>{money(spent)} total</dd>
                </div>
              )}
            </dl>
            <p className="field-help">
              Estimate covers the listed experience only. Transport and extras
              may need additional budget.
            </p>
          </section>
          <section className="sheet-section">
            <div className="section-heading">
              <h2>The people</h2>
              <span aria-live="polite">
                {plan.going.length} of {plan.people} going
              </span>
            </div>
            <div className="people-list">
              {plan.attendees.map((id) => {
                const member = members.find((person) => person.id === id);
                if (!member) return null;
                const going = plan.going.includes(id),
                  no = plan.declined?.includes(id);
                return (
                  <div className="person-row" key={id}>
                    <span className="monogram">{member.initials}</span>
                    <div>
                      <strong>
                        {member.name}
                        {id === viewerId ? " (you)" : ""}
                      </strong>
                      <small>{member.team}</small>
                    </div>
                    <span
                      className={`status-text ${going ? "is-approved" : ""}`}
                    >
                      <i />
                      {going ? "Going" : no ? "Not going" : "Not replied"}
                    </span>
                    {id === (live ? viewerId : "akin") &&
                      (live || role === "employee") &&
                      plan.status === "Approved" &&
                      !plan.settledAt &&
                      plan.date >= localDate() && (
                        <div className="rsvp-controls">
                          <button
                            className="button button-outline"
                            aria-pressed={isGoing}
                            onClick={() => onRsvp(true)}
                          >
                            Going
                          </button>
                          <button
                            className="button button-outline"
                            aria-pressed={!!declined}
                            onClick={() => onRsvp(false)}
                          >
                            Can’t make it
                          </button>
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
            {shown.people > plan.attendees.length && (
              <p className="field-help">
                {plan.attendees.length} named teammates
                {live ? "" : " in this preview"}; planning for {shown.people}{" "}
                people. No invitations are sent.
              </p>
            )}
          </section>
          {plan.status === "Approved" || expenses.length ? (
            <section className="sheet-section">
              <div className="section-heading">
                <h2>Expenses</h2>
                {plan.status === "Approved" && !plan.settledAt && (
                  <button className="text-button" onClick={onExpense}>
                    Add expense
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
              <ExpenseLedger expenses={expenses} />
            </section>
          ) : null}
          <section className="sheet-section">
            <div className="section-heading">
              <h2>Activity</h2>
              <span>
                {live ? "Recorded by your team" : "Recorded in this browser"}
              </span>
            </div>
            {plan.events?.length ? (
              <ol className="activity-list">
                {[...plan.events].reverse().map((item) => (
                  <li key={item.id}>
                    <span className="activity-dot" />
                    <p>
                      {item.text}
                      <time dateTime={item.at}>
                        {new Date(item.at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-inline">
                No recorded activity yet. Actions you take here will appear in
                this history.
              </p>
            )}
          </section>
          {plan.status !== "Cancelled" && !plan.settledAt && (
            <button className="text-button cancel-link" onClick={onCancel}>
              Cancel this outing
            </button>
          )}
        </div>
        <aside className="summary-rail" aria-label="Plan summary">
          <div className="rail-inner">
            <span className="rail-label">Estimated total</span>
            <strong className="rail-total">{money(total)}</strong>
            <span>
              {money(unitPrice)} per person · {shown.people} people
            </span>
            <div className="rail-budget">
              <span>
                Total budget<strong>{money(shown.budget)}</strong>
              </span>
              <span className={difference < 0 ? "error-text" : ""}>
                {money(Math.abs(difference))}{" "}
                {difference < 0 ? "over budget" : "remaining"}
              </span>
            </div>
            {editable ? (
              <>
                <p
                  className={
                    difference < 0 || missing ? "form-error" : "field-help"
                  }
                >
                  {missing
                    ? "Add a name, date, place and people before sending."
                    : difference < 0
                      ? "The estimate is above your budget. Increase the budget, reduce the group, or save a draft."
                      : `Ready for ${managerLabel} to review. You can still refine the details.`}
                </p>
                <button
                  form="plan-editor"
                  type="submit"
                  value="review"
                  className="button button-dark full-width"
                  disabled={difference < 0 || !!missing}
                >
                  Send to {managerLabel} for approval
                  <ArrowRight size={16} />
                </button>
                <p className="field-help rail-preview">
                  {live
                    ? "Your manager can review this in Teamfare. No email is sent."
                    : "This records a review request locally. No email is sent."}
                </p>
              </>
            ) : plan.status === "Awaiting approval" ? (
              <>
                <p className="field-help">
                  {review
                    ? "Review the proposal above. Your decision will appear in its activity history."
                    : live
                      ? "A different manager must review this proposal."
                      : "Nadia’s approval is the next step. Use the account menu to try the manager view."}
                </p>
                {review && (
                  <button
                    className="button button-dark rail-mobile-only"
                    onClick={approve}
                    disabled={difference < 0}
                  >
                    Approve
                    <Check size={17} />
                  </button>
                )}
              </>
            ) : plan.status === "Approved" && !plan.settledAt ? (
              <>
                {needsYou(plan, role, live ? viewerId : "akin") ? (
                  <a
                    href="#people-section"
                    className="button button-dark"
                    onClick={(e) => {
                      e.preventDefault();
                      document.querySelector(".people-list")?.scrollIntoView({
                        behavior: "instant",
                        block: "center",
                      });
                    }}
                  >
                    Let the team know
                    <ArrowRight size={16} />
                  </a>
                ) : (
                  <button className="button button-dark" onClick={onExpense}>
                    Add expense
                    <ArrowRight size={16} />
                  </button>
                )}
                <p className="field-help rail-preview">
                  No booking, payment, or invitation is made here.
                </p>
                {role === "manager" && plan.date < localDate() && (
                  <button
                    className="button button-outline"
                    onClick={async () => {
                      const saved = await onSave({
                        ...plan,
                        settledAt: new Date().toISOString(),
                        events: [
                          ...(plan.events ?? []),
                          event(`${actor} marked expense recording complete.`),
                        ],
                      });
                      if (saved === false) return;
                      announce(
                        "Outing settled. Expense recording is now closed.",
                      );
                    }}
                  >
                    Mark settled
                  </button>
                )}
              </>
            ) : (
              <p className="field-help">
                This plan is kept as a record. {money(spent)} in expenses
                recorded.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
