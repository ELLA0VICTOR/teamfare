import { useState } from "react";
import { api } from "../api";
import type { Plan } from "../data";
import { useTeam } from "../team-context";
export function InvitationActions({
  plan,
  csrf,
  onChanged,
}: {
  plan: Plan;
  csrf: string;
  onChanged: () => Promise<void>;
}) {
  const { viewerId, members } = useTeam(),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requestId] = useState(() => crypto.randomUUID());
  if (
    plan.status !== "Approved" ||
    plan.settledAt ||
    (plan.createdBy !== viewerId &&
      members.find((m) => m.id === viewerId)?.role !== "manager")
  )
    return null;
  return (
    <div className="invitation-actions">
      <label className="check-option">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        Send a fresh invitation to guests who enabled outing email. Existing
        accepted emails cannot be recalled.
      </label>
      <button
        className="button button-outline"
        disabled={!confirmed || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await api(`/plans/${plan.id}/invitations`, { requestId }, csrf);
            await onChanged();
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Invitations could not be requested.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        Send invitations
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
