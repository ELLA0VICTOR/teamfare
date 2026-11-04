import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Brand } from "./Brand";
import { api } from "../api";
import type { Connection } from "../team-context";

export function AccountGate({
  onSignIn,
  onPreview,
}: {
  onSignIn: (connection: Connection) => void;
  onPreview: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "join">("login");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      onSignIn(await api<Connection>(`/auth/${mode}`, data));
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
            {mode === "login"
              ? "Welcome back."
              : mode === "register"
                ? "Bring your team."
                : "You’re invited."}
          </h2>
          <p>
            {mode === "login"
              ? "Sign in to your team’s plans and expenses."
              : mode === "register"
                ? "Create your team and become its first manager."
                : "Use the invitation code shared by your manager."}
          </p>
          <div className="text-tabs" role="group" aria-label="Account action">
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
            {mode !== "login" && (
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
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
              />
              {mode !== "login" && (
                <span className="field-help">Use at least 12 characters.</span>
              )}
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button button-dark"
              disabled={busy}
              type="submit"
            >
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : mode === "register"
                    ? "Create team"
                    : "Join team"}
              <ArrowRight size={17} />
            </button>
          </form>
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
