import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Modal } from "./Modal";
import { ExperienceArt } from "./ExperienceArt";
import { experienceFor, experiences, localDate, members, money } from "../data";
import type { Expense, Plan, Status } from "../data";

export function CreatePlan({
  initialExperienceId,
  existing,
  brief,
  onClose,
  onCreate,
}: {
  initialExperienceId?: string;
  existing?: Plan;
  brief: string;
  onClose: () => void;
  onCreate: (plan: Plan) => void;
}) {
  const suggested =
    existing?.experienceId ??
    initialExperienceId ??
    (/(clay|potter|creativ|mak)/i.test(brief)
      ? "clay"
      : /(court|tennis|outdoor|sport)/i.test(brief)
        ? "court"
        : /(dinner|supper|evening)/i.test(brief)
          ? "supper"
          : "long-table");
  const group = Number(brief.match(/(?:for|team of)\s+(\d{1,2})/i)?.[1]) || 8;
  const [step, setStep] = useState(existing ? 2 : 1);
  const [experienceId, setExperienceId] = useState(suggested);
  const [people, setPeople] = useState(
    existing?.people ?? Math.min(group, experienceFor(suggested).capacity),
  );
  const [date, setDate] = useState(existing?.date ?? localDate(8));
  const [time, setTime] = useState(existing?.time ?? "13:00");
  const [title, setTitle] = useState(
    existing?.title ?? "A little time together",
  );
  const [note, setNote] = useState(existing?.note ?? brief);
  const [budget, setBudget] = useState(
    existing?.budget ??
      experienceFor(suggested).price *
        Math.min(group, experienceFor(suggested).capacity) +
        20000,
  );
  const [error, setError] = useState("");
  const experience = experienceFor(experienceId),
    estimate = experience.price * people;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (step === 1) {
      setStep(2);
      return;
    }
    if (
      !title.trim() ||
      people < 2 ||
      people > experience.capacity ||
      !Number.isInteger(people) ||
      !Number.isSafeInteger(budget) ||
      budget < 0 ||
      budget > 100000000 ||
      date < localDate()
    ) {
      setError("Check the outing name, date, group size, and budget.");
      return;
    }
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const status: Status =
      submitter?.value === "draft" ? "Draft" : "Awaiting approval";
    if (status !== "Draft" && budget < estimate) {
      setError(
        "The estimate is above your budget. Adjust the budget or save a draft.",
      );
      return;
    }
    const attendees = members
      .slice(0, Math.min(people, members.length))
      .map((member) => member.id);
    onCreate({
      id: existing?.id ?? crypto.randomUUID(),
      experienceId,
      title: title.trim(),
      date,
      time,
      people,
      budget,
      status,
      note: note.trim(),
      attendees,
      going: existing?.going.filter((id) => attendees.includes(id)) ?? ["akin"],
    });
  }
  return (
    <Modal title="LET’S MAKE A PLAN" onClose={onClose} wide>
      <div className="create-heading">
        <span className="step-counter">0{step} / 02</span>
        <h2>
          {step === 1 ? (
            <>
              Find your kind
              <br />
              of <em>good.</em>
            </>
          ) : (
            <>
              The people.
              <br />
              The <em>particulars.</em>
            </>
          )}
        </h2>
        <p>
          {step === 1
            ? "Start with a sample experience. We’ll put the details in one place."
            : "A few little details, and you’re on your way."}
        </p>
      </div>
      <form onSubmit={submit}>
        {step === 1 ? (
          <>
            <div className="experience-choices">
              {experiences.map((item) => (
                <label
                  key={item.id}
                  className={`experience-choice ${experienceId === item.id ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="experience"
                    value={item.id}
                    checked={experienceId === item.id}
                    onChange={() => {
                      setExperienceId(item.id);
                      setPeople(Math.min(people, item.capacity));
                      setBudget(
                        item.price * Math.min(people, item.capacity) + 20000,
                      );
                    }}
                  />
                  <ExperienceArt experience={item} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>
                      {money(item.price)} / person · {item.duration}
                    </small>
                  </span>
                  <span className="radio-indicator">
                    {experienceId === item.id && <Check size={12} />}
                  </span>
                </label>
              ))}
            </div>
            <p className="field-help">
              Sample catalogue · estimated prices · no live venue search or AI
              generation.
            </p>
            <div className="form-actions">
              <span>Good things start with a small yes.</span>
              <button className="button button-dark" type="submit">
                Let’s do this <ArrowRight size={17} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="create-details">
              <div className="form-grid">
                <label className="field field-full">
                  Give it a name
                  <input
                    required
                    maxLength={80}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="field">
                  When?
                  <input
                    required
                    type="date"
                    min={localDate()}
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  What time?
                  <input
                    required
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                  />
                </label>
                <label className="field">
                  How many people?
                  <input
                    required
                    type="number"
                    min={2}
                    max={experience.capacity}
                    step={1}
                    value={people}
                    onChange={(event) => setPeople(Number(event.target.value))}
                  />
                </label>
                <label className="field">
                  Total budget (NGN)
                  <input
                    required
                    type="number"
                    min={0}
                    max={100000000}
                    step={1}
                    value={budget}
                    onChange={(event) => setBudget(Number(event.target.value))}
                  />
                </label>
                <label className="field field-full">
                  A note for the team <span className="muted">(optional)</span>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Anything your people should know?"
                  />
                </label>
              </div>
              <aside className="create-estimate">
                <span className="eyebrow">YOUR LITTLE PLAN</span>
                <h3>{experience.name}</h3>
                <p>{experience.area}</p>
                <div>
                  <span>
                    {money(experience.price)} × {people} people
                  </span>
                  <strong>{money(estimate)}</strong>
                </div>
                <span
                  className={estimate > budget ? "error-text" : "budget-good"}
                >
                  {estimate > budget
                    ? `${money(estimate - budget)} over your budget`
                    : `${money(budget - estimate)} room in your budget`}
                </span>
                <p className="field-help">
                  Your first {Math.min(people, members.length)} sample teammates
                  will be added. Manager approval is a planning step, not a
                  venue booking.
                </p>
              </aside>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                className="text-button"
                type="button"
                onClick={() => setStep(1)}
              >
                <ArrowLeft size={16} />
                Back
              </button>
              <div>
                <button
                  className="button button-outline"
                  name="status"
                  value="draft"
                  type="submit"
                >
                  Save draft
                </button>
                <button
                  className="button button-dark"
                  name="status"
                  value="review"
                  type="submit"
                >
                  Send for approval <ArrowUpRight size={17} />
                </button>
              </div>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
export function ExpenseForm({
  plans,
  defaultPlanId,
  onClose,
  onSubmit,
}: {
  plans: Plan[];
  defaultPlanId?: string;
  onClose: () => void;
  onSubmit: (expense: Expense) => void;
}) {
  const eligible = plans.filter((plan) => plan.status === "Approved");
  const [error, setError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      amount = Number(form.get("amount")),
      description = String(form.get("description")).trim(),
      planId = String(form.get("plan")),
      date = String(form.get("date"));
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 100000000 ||
      !description ||
      !eligible.some((plan) => plan.id === planId) ||
      date > localDate()
    ) {
      setError(
        "Choose an approved outing, a valid date, and an amount in whole naira.",
      );
      return;
    }
    onSubmit({
      id: crypto.randomUUID(),
      planId,
      description,
      amount,
      payer: String(form.get("payer")),
      category: String(form.get("category")),
      date,
    });
  }
  return (
    <Modal title="THE LITTLE COSTS" onClose={onClose}>
      <h2>
        Add it to
        <br />
        <em>the tab.</em>
      </h2>
      <p className="modal-description">
        Keep a record of what was spent and who picked it up.
      </p>
      {eligible.length ? (
        <form onSubmit={submit} className="expense-form">
          <label className="field">
            Which outing?
            <select
              required
              name="plan"
              defaultValue={defaultPlanId ?? eligible[0]?.id}
            >
              {eligible.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            What was it for?
            <input
              name="description"
              required
              maxLength={100}
              placeholder="Lunch, transport, a little extra…"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Amount (NGN)
              <input
                name="amount"
                required
                type="number"
                min={1}
                max={100000000}
                step={1}
                placeholder="0"
              />
            </label>
            <label className="field">
              Date
              <input
                name="date"
                required
                type="date"
                max={localDate()}
                defaultValue={localDate()}
              />
            </label>
            <label className="field">
              Paid by
              <select name="payer">
                {members.map((member) => (
                  <option key={member.id}>{member.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              Category
              <select name="category">
                <option>Food & drinks</option>
                <option>Activity</option>
                <option>Transport</option>
                <option>Other</option>
              </select>
            </label>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="field-help">
            This records an expense locally. No card is charged and no
            reimbursement is initiated.
          </p>
          <button className="button button-dark full-width" type="submit">
            Record expense <Check size={17} />
          </button>
        </form>
      ) : (
        <div className="empty-state">
          <p>You’ll need an approved outing before adding expenses.</p>
          <button className="button button-outline" onClick={onClose}>
            Got it
          </button>
        </div>
      )}
    </Modal>
  );
}
