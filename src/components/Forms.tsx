import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Modal } from "./Modal";
import { localDate, members } from "../data";
import type { Expense, Plan } from "../data";

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
  const eligible = plans.filter(
    (plan) => plan.status === "Approved" && !plan.settledAt,
  );
  const [error, setError] = useState("");
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const amount = Number(data.get("amount")),
      description = String(data.get("description")).trim();
    const date = String(data.get("date")),
      planId = String(data.get("plan"));
    if (
      !description ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 100000000 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date > localDate() ||
      !eligible.some((plan) => plan.id === planId)
    ) {
      setError(
        "Choose an approved outing, a valid date, and a positive amount in whole naira.",
      );
      return;
    }
    onSubmit({
      id: crypto.randomUUID(),
      planId,
      amount,
      description,
      date,
      payer: String(data.get("payer")),
      category: String(data.get("category")),
    });
  }
  return (
    <Modal title="Add expense" drawer onClose={onClose}>
      <h2>Add expense</h2>
      <p className="modal-description">
        A clear record of what was spent, and who paid.
      </p>
      {eligible.length ? (
        <form onSubmit={submit} className="expense-form">
          <label className="field">
            Outing
            <select
              name="plan"
              required
              defaultValue={
                eligible.some((plan) => plan.id === defaultPlanId)
                  ? defaultPlanId
                  : eligible[0].id
              }
            >
              {eligible.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Description
            <input
              name="description"
              required
              maxLength={100}
              placeholder="e.g. Transport to lunch"
            />
          </label>
          <div className="form-grid">
            <label className="field">
              Amount (NGN)
              <input
                name="amount"
                required
                type="number"
                min="1"
                max="100000000"
                step="1"
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
          </div>
          <label className="field">
            Category
            <select name="category">
              <option>Food & drinks</option>
              <option>Activity</option>
              <option>Transport</option>
              <option>Other</option>
            </select>
          </label>
          <label className="field">
            Paid by
            <select name="payer">
              {members.map((member) => (
                <option key={member.id}>{member.name}</option>
              ))}
            </select>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="field-help">
            Saved in this browser. No payment or reimbursement is made.
          </p>
          <button className="button button-dark full-width" type="submit">
            Record expense
            <ArrowRight size={18} />
          </button>
        </form>
      ) : (
        <div className="empty-state">
          <p>
            Approve an outing before recording expenses. Settled outings are
            closed to new expenses.
          </p>
          <button className="button button-outline" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Modal>
  );
}
