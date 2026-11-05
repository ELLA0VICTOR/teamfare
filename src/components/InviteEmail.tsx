import { useState } from "react";
import { api } from "../api";
import { DeliveryStatus } from "./DeliveryStatus";
export function InviteEmail({
  invite,
  csrf,
}: {
  invite: { id: string; code: string };
  csrf: string;
}) {
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requested, setRequested] = useState(false);
  return (
    <section className="invite-email">
      <h3>Email the invitation</h3>
      <p className="field-help">
        The invitation becomes restricted to this address. The recipient must
        verify their email before joining.
      </p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await api<{ status: string }>(
              `/invites/${invite.id}/email`,
              { email, code: invite.code },
              csrf,
            );
            if (result.status === "failed" || result.status === "suppressed")
              throw new Error(
                "The invitation could not be queued. Check email status below.",
              );
            setRequested(true);
          } catch (e) {
            setError(
              e instanceof Error
                ? e.message
                : "Email invitation could not be requested.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Teammate email
          <input
            type="email"
            required
            maxLength={254}
            value={email}
            disabled={requested}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {requested ? (
          <p role="status">
            Invitation requested. Check email acceptance below.
          </p>
        ) : (
          <button className="button button-outline" disabled={busy}>
            Email invitation
          </button>
        )}
      </form>
      {requested && <DeliveryStatus />}
    </section>
  );
}
