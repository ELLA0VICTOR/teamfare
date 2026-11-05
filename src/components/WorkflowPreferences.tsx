import { useEffect, useState } from "react";
import { api } from "../api";
type Preferences = {
  outingEmails: boolean;
  interests: string[];
  judge: boolean;
};
export function WorkflowPreferences({
  csrf,
  onChanged,
}: {
  csrf: string;
  onChanged: () => Promise<void>;
}) {
  const [values, setValues] = useState<Preferences | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void api<Preferences>("/workflow/preferences")
      .then((p) => {
        if (active) setValues(p);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof Error ? e.message : "Preferences unavailable.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section>
      <h2>Outing preferences</h2>
      <p className="field-help">
        Account verification and recovery emails remain required. These
        preferences control outing coordination and help organisers find
        interested teammates.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {values && (
        <form
          className="account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(
                "/workflow/preferences",
                {
                  outingEmails: values.outingEmails,
                  interests: values.interests,
                },
                csrf,
                "PUT",
              );
              await onChanged();
              setNotice("Preferences saved.");
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Preferences could not be saved.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="check-option">
            <input
              type="checkbox"
              disabled={values.judge}
              checked={values.outingEmails}
              onChange={(e) =>
                setValues({ ...values, outingEmails: e.target.checked })
              }
            />
            Email me outing invitations, availability requests, review updates
            and reminders
          </label>
          {values.judge && (
            <p className="field-help">
              External email is disabled for public judge accounts.
            </p>
          )}
          <fieldset>
            <legend>Activities I enjoy</legend>
            {["Good food", "Make something", "A little adventure"].map(
              (category) => (
                <label className="check-option" key={category}>
                  <input
                    type="checkbox"
                    checked={values.interests.includes(category)}
                    onChange={(e) =>
                      setValues({
                        ...values,
                        interests: e.target.checked
                          ? [...values.interests, category]
                          : values.interests.filter((c) => c !== category),
                      })
                    }
                  />
                  {category}
                </label>
              ),
            )}
          </fieldset>
          <button className="button button-dark" disabled={busy}>
            Save preferences
          </button>
        </form>
      )}
    </section>
  );
}
