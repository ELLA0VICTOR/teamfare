import { useEffect, useState } from "react";
import { api } from "../api";
import type { WorkflowEmail } from "../workflows";
const labels = {
  pending: "Queued",
  sending: "Sending",
  accepted: "Accepted by email service",
  failed: "Needs attention",
  suppressed: "Email disabled",
  cancelled: "Cancelled",
};
export function DeliveryStatus({ planId }: { planId?: string }) {
  const [rows, setRows] = useState<WorkflowEmail[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const next = await api<WorkflowEmail[]>(
          planId ? `/plans/${planId}/emails` : "/workflow/emails",
        );
        if (active) {
          setRows(next);
          setError("");
        }
      } catch (e) {
        if (active)
          setError(
            e instanceof Error ? e.message : "Email status is unavailable.",
          );
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [planId]);
  return (
    <section className={planId ? "sheet-section" : "delivery-section"}>
      <div className="section-heading">
        <h2>Email status</h2>
        <span>Provider acceptance</span>
      </div>
      <p className="field-help">
        Acceptance means the email service accepted the request; it does not
        prove inbox delivery. Invitations and reminders respect each recipient's
        preferences.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {rows.length ? (
        <ul className="delivery-list">
          {rows.slice(0, 30).map((row) => (
            <li key={row.id}>
              <div>
                <strong>{row.kind.replaceAll("_", " ")}</strong>
                <span>{row.recipient}</span>
                {row.error && <small>{row.error}</small>}
              </div>
              <div>
                <span className="status-text">
                  <i />
                  {labels[row.status]}
                </span>
                <small>
                  {new Date(row.scheduledAt).toLocaleString("en-GB", {
                    timeZone: "Africa/Lagos",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}{" "}
                  · Lagos{row.attempts ? ` · ${row.attempts} attempts` : ""}
                </small>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-inline">No email requests recorded yet.</p>
      )}
    </section>
  );
}
