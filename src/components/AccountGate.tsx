import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Brand } from "./Brand";
import { api } from "../api";
import type { Connection } from "../team-context";
import type { AuthChallenge } from "../identity";
import { CodeForm } from "./CodeForm";

const challengeKey = "teamfare-auth-challenge";
function restoreChallenge(): AuthChallenge | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(challengeKey) ?? "null",
    ) as AuthChallenge | null;
    if (
      value &&
      ["signup", "login", "reset"].includes(value.purpose) &&
      typeof value.challengeId === "string" &&
      typeof value.email === "string" &&
      Date.parse(value.expiresAt) > Date.now() &&
      Number.isFinite(Date.parse(value.resendAt))
    )
      return value;
  } catch {
    /* Discard expired or malformed tab-local requests. */
  }
  sessionStorage.removeItem(challengeKey);
  return null;
}

export function AccountGate({
  onSignIn,
  onPreview,
}: {
  onSignIn: (connection: Connection) => void;
  onPreview: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "join" | "forgot">(
    "login",
  );
  const [challenge, setChallenge] = useState(restoreChallenge),
    [notice, setNotice] = useState(""),
    [judgeAccess, setJudgeAccess] = useState(false),
    [ready, setReady] = useState<boolean | null>(null);
  useEffect(() => {
    const lifecycle = new AbortController();
    void api<{ ready: boolean; judgeAccess?: boolean }>("/auth/config")
      .then((result) => {
        if (!lifecycle.signal.aborted) {
          setReady(result.ready);
          setJudgeAccess(!!result.judgeAccess);
        }
      })
      .catch(() => {
        if (!lifecycle.signal.aborted) setReady(false);
      });
    return () => lifecycle.abort();
  }, []);
  function changeChallenge(next: AuthChallenge | null) {
    setChallenge(next);
    if (next) sessionStorage.setItem(challengeKey, JSON.stringify(next));
    else sessionStorage.removeItem(challengeKey);
  }
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data: Record<string, unknown> = Object.fromEntries(
      new FormData(event.currentTarget),
    );
    if (mode === "register" || mode === "join")
      data.outingEmails = data.outingEmails === "on";
    try {
      const result = await api<AuthChallenge | Connection>(
        `/auth/${mode === "forgot" ? "forgot-password" : mode}`,
        data,
      );
      if ("user" in result) {
        changeChallenge(null);
        onSignIn(result);
      } else changeChallenge(result);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="account-gate page-width">
      <a className="brand-link" href="#home">
        <Brand />
      </a>
      <div className="account-gate-layout">
        <section className="account-story">
          <span className="eyebrow">Make time for your team</span>
          <h1>
            Good plans.
            <br />
            Shared with
            <br />
            your people.
          </h1>
          <p>
            One place to shape an outing, review the budget, and bring everyone
            together.
          </p>
          <img
            src="/images/together.jpg"
            alt="Friends sharing a meal around a restaurant table"
          />
        </section>
        <section className="account-form-section">
          <span className="eyebrow">Teamfare</span>
          <h2>
            {challenge
              ? challenge.purpose === "reset"
                ? "Reset your password."
                : "Check your email."
              : mode === "forgot"
                ? "Find your way back."
                : mode === "login"
                  ? "Welcome back."
                  : mode === "register"
                    ? "Bring your team."
                    : "You’re invited."}
          </h2>
          {!challenge && (
            <p>
              {mode === "login"
                ? "Sign in with your password, then confirm the code sent to your email."
                : mode === "register"
                  ? "Verify your email to create your team and become its first manager."
                  : mode === "forgot"
                    ? "We’ll email a code if this address has a Teamfare account."
                    : "Use your manager’s invitation and verify your email before joining."}
            </p>
          )}
          {judgeAccess && !challenge && mode === "login" && (
            <p className="field-help">
              Judging? The public accounts listed in our GitHub README sign in
              without an email code. Use sample information only.
            </p>
          )}
          {ready === false && (
            <p className="form-error" role="status">
              Account email delivery is not configured or the server is
              unavailable. Contact the team administrator before signing up. You
              can still explore the sample team.
            </p>
          )}
          {notice && (
            <p className="account-notice" role="status">
              {notice}
            </p>
          )}
          {challenge ? (
            <CodeForm
              key={challenge.challengeId}
              challenge={challenge}
              onChallenge={changeChallenge}
              onBack={() => {
                changeChallenge(null);
                setMode("login");
                setError("");
              }}
              onComplete={(result) => {
                changeChallenge(null);
                if ("user" in result) onSignIn(result);
                else {
                  setMode("login");
                  setNotice(
                    "Your password has been reset and previous sessions were signed out. Sign in with your new password.",
                  );
                }
              }}
            />
          ) : (
            <>
              <div
                className="text-tabs"
                role="group"
                aria-label="Account action"
              >
                {(["login", "register", "join"] as const).map((item) => (
                  <button
                    key={item}
                    className={mode === item ? "active" : ""}
                    aria-pressed={mode === item}
                    disabled={busy}
                    onClick={() => {
                      setMode(item);
                      setError("");
                    }}
                  >
                    {item === "login"
                      ? "Sign in"
                      : item === "register"
                        ? "Create a team"
                        : "Join a team"}
                  </button>
                ))}
              </div>
              <form key={mode} onSubmit={submit} className="account-form">
                {(mode === "register" || mode === "join") && (
                  <label className="field">
                    Your name
                    <input
                      required
                      name="name"
                      autoComplete="name"
                      maxLength={80}
                    />
                  </label>
                )}
                {mode === "register" && (
                  <label className="field">
                    Team name
                    <input
                      required
                      name="teamName"
                      maxLength={80}
                      placeholder="e.g. Koto team"
                    />
                  </label>
                )}
                {mode === "join" && (
                  <label className="field">
                    Invitation code
                    <input
                      required
                      name="inviteCode"
                      autoComplete="off"
                      minLength={20}
                      maxLength={128}
                      spellCheck={false}
                    />
                  </label>
                )}
                <label className="field">
                  Email
                  <input
                    required
                    type="email"
                    name="email"
                    autoComplete="email"
                    maxLength={254}
                  />
                </label>
                {mode !== "forgot" && (
                  <label className="field">
                    Password
                    <input
                      required
                      aria-label="Password"
                      type="password"
                      name="password"
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      minLength={mode === "login" ? 1 : 15}
                      maxLength={128}
                    />
                    {mode !== "login" && (
                      <span className="field-help">
                        Use at least 15 characters. Spaces and password managers
                        are welcome.
                      </span>
                    )}
                  </label>
                )}
                {(mode === "register" || mode === "join") && (
                  <label className="field">
                    Confirm password
                    <input
                      required
                      type="password"
                      name="confirmPassword"
                      autoComplete="new-password"
                      minLength={15}
                      maxLength={128}
                    />
                  </label>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {(mode === "register" || mode === "join") && (
                  <label className="check-option">
                    <input type="checkbox" name="outingEmails" />
                    Email me outing invitations, availability requests, review
                    updates and reminders. I can change this later.
                  </label>
                )}
                <button
                  className="button button-dark"
                  disabled={
                    busy ||
                    !(ready === true || (mode === "login" && judgeAccess))
                  }
                  type="submit"
                >
                  {busy
                    ? "Please wait…"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "register"
                        ? "Create team"
                        : mode === "forgot"
                          ? "Send reset code"
                          : "Join team"}
                  <ArrowRight size={17} />
                </button>
                {mode === "login" && (
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setError("");
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </form>
            </>
          )}
          <div className="account-preview">
            <p>Want to look around first?</p>
            <button className="text-button" onClick={onPreview}>
              Explore the sample team
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
