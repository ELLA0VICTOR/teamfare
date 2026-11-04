import { useEffect, useState } from "react";
import App from "./App";
import { AccountGate } from "./components/AccountGate";
import { getSession } from "./api";
import type { Connection } from "./team-context";
export default function Root() {
  const [preview, setPreview] = useState(
    () => sessionStorage.getItem("teamfare-mode") === "preview",
  );
  const [session, setSession] = useState<Connection | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState("");
  useEffect(() => {
    if (preview) return;
    let active = true;
    getSession()
      .then((result) => {
        if (active && result.user) setSession(result as Connection);
      })
      .catch(() => {
        if (active)
          setError(
            "The server is unavailable. Start the Teamfare API, or explore the sample team.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [preview]);
  function previewMode() {
    sessionStorage.setItem("teamfare-mode", "preview");
    setSession(null);
    setPreview(true);
    setError("");
  }
  function signIn(connection: Connection) {
    sessionStorage.removeItem("teamfare-mode");
    setSession(connection);
    setPreview(false);
    setLoading(false);
    setError("");
  }
  function leave() {
    sessionStorage.removeItem("teamfare-mode");
    setSession(null);
    setPreview(false);
    window.location.hash = "home";
  }
  if (loading)
    return (
      <main className="page-width account-loading" role="status">
        Opening Teamfare…
      </main>
    );
  if (preview || session)
    return (
      <App
        key={session?.user.id ?? "preview"}
        connection={session ?? undefined}
        onExit={leave}
      />
    );
  return (
    <>
      {error && (
        <p className="account-connection-error" role="status">
          {error}
        </p>
      )}
      <AccountGate onSignIn={signIn} onPreview={previewMode} />
    </>
  );
}
