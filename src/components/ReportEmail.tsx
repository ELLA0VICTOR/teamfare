import { useState } from "react";
import { api } from "../api";
import { useTeam } from "../team-context";
import type { ReportFilter } from "../workflows";
import { DeliveryStatus } from "./DeliveryStatus";
import { useCurrency } from "../currency-context";
export function ReportEmail({
  filter,
  csrf,
}: {
  filter: ReportFilter;
  csrf: string;
}) {
  const { currency, quote } = useCurrency();
  const { members, viewerId } = useTeam(),
    [recipient, setRecipient] = useState(viewerId),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requested, setRequested] = useState(false),
    [requestId] = useState(() => crypto.randomUUID());
  return (
    <section className="report-email">
      <h2>Email expense report</h2>
      <p>
        The email will contain the current outing/date-filtered CSV. Choose a
        verified teammate as the recipient.
      </p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api<{ id: string; status: string }>(
              "/reports/expenses/email",
              {
                ...filter,
                recipientId: recipient,
                requestId,
                currency,
                quoteId: quote.id,
              },
              csrf,
            );
            if (result.status === "failed" || result.status === "suppressed")
              throw new Error(
                "The report could not be queued. Check email status below.",
              );
            setRequested(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Report email could not be requested.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Report recipient
          <select
            value={recipient}
            disabled={requested}
            onChange={(e) => setRecipient(e.target.value)}
          >
            {members.map((m) => (
              <option value={m.id} key={m.id}>
                {m.name}
                {m.id === viewerId ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {requested ? (
          <p role="status">
            Report requested. Follow the email status below; acceptance is not
            proof of inbox delivery.
          </p>
        ) : (
          <button className="button button-dark" disabled={busy}>
            Email this report
          </button>
        )}
      </form>
      <DeliveryStatus />
    </section>
  );
}
