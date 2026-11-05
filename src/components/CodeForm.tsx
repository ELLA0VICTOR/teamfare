import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "../api";
import type { AuthChallenge, AuthResult } from "../identity";
import type { Connection } from "../team-context";

export function CodeForm({
  challenge,
  onChallenge,
  onComplete,
  onBack,
  csrf,
}: {
  challenge: AuthChallenge;
  onChallenge: (value: AuthChallenge) => void;
  onComplete: (result: Connection | AuthResult) => void;
  onBack: () => void;
  csrf?: string;
}) {
  const [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const remaining = Math.max(
    0,
    Math.ceil((Date.parse(challenge.resendAt) - now) / 1000),
  );
  const expired = Date.parse(challenge.expiresAt) <= now;
  return (
    <form
      className="account-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const form = new FormData(event.currentTarget);
        try {
          const reset = challenge.purpose === "reset";
          const result = await api<Connection | AuthResult>(
            reset ? "/auth/reset-password" : "/auth/verify",
            {
              challengeId: challenge.challengeId,
              code,
              ...(reset
                ? {
                    password: form.get("password"),
                    confirmPassword: form.get("confirmPassword"),
                  }
                : {}),
            },
            csrf,
          );
          onComplete(result);
        } catch (failure) {
          setError(
            failure instanceof Error
              ? failure.message
              : "That code could not be checked.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>{challenge.message}</p>
      <p className="field-help">
        Email: <strong>{challenge.email}</strong>
      </p>
      <label className="field">
        Verification code
        <input
          autoFocus
          required
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          aria-describedby="code-expiry"
        />
      </label>
      <p className="field-help" id="code-expiry">
        {expired
          ? "This code has expired. Go back and start again."
          : "Codes are single-use and expire after 10 minutes. Five incorrect attempts lock this request."}
      </p>
      {challenge.purpose === "reset" && (
        <>
          <label className="field">
            New password
            <input
              required
              name="password"
              aria-label="New password"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
            />
            <span className="field-help">
              Use at least 15 characters. Spaces and password managers are
              welcome.
            </span>
          </label>
          <label className="field">
            Confirm new password
            <input
              required
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={15}
              maxLength={128}
            />
          </label>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="field-help" role="status">
          {notice}
        </p>
      )}
      <button
        className="button button-dark"
        disabled={busy || expired}
        type="submit"
      >
        {busy
          ? "Checking…"
          : challenge.purpose === "reset"
            ? "Reset password"
            : challenge.purpose === "change_password"
              ? "Confirm password change"
              : "Verify and continue"}
        <ArrowRight size={17} />
      </button>
      <div className="code-actions">
        <button
          type="button"
          className="text-button"
          disabled={busy || remaining > 0 || expired}
          onClick={async () => {
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const next = await api<AuthChallenge>(
                "/auth/resend",
                { challengeId: challenge.challengeId },
                csrf,
              );
              onChallenge(next);
              setCode("");
              setNotice(
                "A new code was requested. The previous code will no longer work.",
              );
            } catch (failure) {
              setError(
                failure instanceof Error
                  ? failure.message
                  : "A new code could not be sent.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {remaining > 0 ? `Resend in ${remaining}s` : "Resend code"}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={onBack}
        >
          Go back
        </button>
      </div>
    </form>
  );
}
