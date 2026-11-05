import { dateLabel, money } from "../data";
import type { Expense } from "../data";
import { ReceiptControl } from "./ReceiptControl";

export function ExpenseLedger({
  expenses,
  csrf,
  onChanged,
  locked = false,
}: {
  expenses: Expense[];
  csrf?: string;
  onChanged?: () => Promise<void>;
  locked?: boolean;
}) {
  return expenses.length ? (
    <table className="expense-table">
      <caption className="sr-only">Recorded expenses</caption>
      <thead>
        <tr>
          <th>Date</th>
          <th>Description</th>
          <th>Category</th>
          <th>Paid by</th>
          <th className="amount">Amount (NGN)</th>
        </tr>
      </thead>
      <tbody>
        {expenses.map((expense) => (
          <tr key={expense.id}>
            <td className="expense-date">{dateLabel(expense.date)}</td>
            <td className="expense-description">
              {expense.description}
              {csrf && onChanged && (
                <ReceiptControl
                  expense={expense}
                  csrf={csrf}
                  onChanged={onChanged}
                  locked={locked}
                />
              )}
            </td>
            <td className="expense-category">{expense.category}</td>
            <td className="expense-payer">{expense.payer}</td>
            <td className="amount">
              {money(expense.amount)}
              <span className="mobile-only"> total</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p className="empty-inline">No expenses recorded for this outing yet.</p>
  );
}

export function SpendBar({ spent, budget }: { spent: number; budget: number }) {
  return (
    <div
      className={`spend-bar ${spent > budget ? "spend-over" : ""}`}
      role="meter"
      aria-label="Recorded spending against budget"
      aria-valuemin={0}
      aria-valuemax={Math.max(budget, spent, 1)}
      aria-valuenow={spent}
      aria-valuetext={`${money(spent)} recorded against ${money(budget)} total budget`}
    >
      <span
        style={{
          width: `${Math.min(100, budget ? (spent / budget) * 100 : spent ? 100 : 0)}%`,
        }}
      />
    </div>
  );
}
