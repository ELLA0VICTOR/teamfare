import { useState } from "react";
import { api } from "../api";
import type { AuthChallenge } from "../identity";
import { CodeForm } from "./CodeForm";

export function AccountSecurity({
  csrf,
  email,
  onSignedOut,
}: {
  csrf: string;
  email: string;
  onSignedOut: () => void;
}) {
  const [challenge, setChallenge] = useState<AuthChallenge | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="account-security">
      <h2>Account security</h2>
      <p className="field-help">Verified email: {email}</p>
      {challenge ? (
        <CodeForm
          challenge={challenge}
          onChallenge={setChallenge}
          onComplete={onSignedOut}
          onBack={() => setChallenge(null)}
          csrf={csrf}
        />
      ) : (
        <form
          className="account-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            setBusy(true);
            const data = Object.fromEntries(new FormData(event.currentTarget));
            try {
              setChallenge(
                await api<AuthChallenge>("/auth/change-password", data, csrf),
              );
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Password change could not start.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Current password
            <input
              required
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              maxLength={128}
            />
          </label>
          <label className="field">
            New password
            <input
              required
              type="password"
              name="password"
              aria-label="New password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
            />
            <span className="field-help">Use at least 15 characters.</span>
          </label>
          <label className="field">
            Confirm new password
            <input
              required
              type="password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
            />
          </label>
          <button className="button button-dark" disabled={busy}>
            {busy ? "Sending…" : "Send confirmation code"}
          </button>
          <p className="field-help">
            Confirm the email code to change your password. All sessions will
            then be signed out, and you’ll receive a security notification.
          </p>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="security-sessions">
        <h3>Sessions</h3>
        <p className="field-help">
          Sign out this browser and every other browser signed in to your
          account.
        </p>
        <button
          type="button"
          className="button button-outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/auth/logout-all", {}, csrf);
              onSignedOut();
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "Sessions could not be signed out.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          Sign out everywhere
        </button>
      </div>
    </section>
  );
}
