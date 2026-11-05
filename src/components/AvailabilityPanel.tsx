import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Plan } from "../data";
import { dateLabel, localDate } from "../data";
import type { Availability } from "../workflows";
import { useTeam } from "../team-context";

export function AvailabilityPanel({
  plan,
  csrf,
  onChanged,
}: {
  plan: Plan;
  csrf: string;
  onChanged: () => Promise<void>;
}) {
  const { viewerId, members } = useTeam(),
    editable =
      plan.createdBy === viewerId &&
      ["Draft", "Changes requested"].includes(plan.status);
  const [poll, setPoll] = useState<Availability | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [answers, setAnswers] = useState<string[]>([]),
    [acknowledged, setAcknowledged] = useState(false);
  const version = useRef(-1);
  const generation = useRef(0);
  const saving = useRef(false);
  const tomorrow = new Date(`${plan.date}T12:00:00+01:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const [slots, setSlots] = useState([
    {
      date: plan.date,
      time: plan.time,
      durationMinutes: plan.durationMinutes ?? 120,
    },
    {
      date: tomorrow.toISOString().slice(0, 10),
      time: plan.time,
      durationMinutes: plan.durationMinutes ?? 120,
    },
  ]);
  useEffect(() => {
    const lifecycle = new AbortController();
    const lifecycleGeneration = generation;
    version.current = -1;
    generation.current++;
    saving.current = false;
    async function load() {
      const requestedGeneration = generation.current;
      try {
        const result = await api<Availability>(
          `/plans/${plan.id}/availability`,
        );
        if (
          lifecycle.signal.aborted ||
          saving.current ||
          requestedGeneration !== generation.current ||
          result.version < version.current
        )
          return;
        setPoll(result);
        if (version.current !== result.version) {
          version.current = result.version;
          setAnswers(
            result.replies.find((r) => r.userId === viewerId)?.available ?? [],
          );
        }
      } catch (e) {
        if (!lifecycle.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Availability could not be loaded.",
          );
      }
    }
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8000);
    return () => {
      lifecycle.abort();
      lifecycleGeneration.current++;
      clearInterval(timer);
    };
  }, [plan.id, viewerId]);
  async function perform(path: string, data: unknown) {
    const requestedGeneration = ++generation.current;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api<Availability>(
        `/plans/${plan.id}/availability${path}`,
        data,
        csrf,
      );
      if (requestedGeneration !== generation.current) return;
      version.current = result.version;
      setPoll(result);
      setAnswers(
        result.replies.find((r) => r.userId === viewerId)?.available ?? [],
      );
      setEditing(false);
    } catch (e) {
      if (requestedGeneration !== generation.current) return;
      setError(
        e instanceof Error ? e.message : "Availability could not be saved.",
      );
    } finally {
      if (requestedGeneration === generation.current) {
        saving.current = false;
        setBusy(false);
      }
    }
  }
  const own = poll?.replies.find((r) => r.userId === viewerId),
    canReply =
      plan.attendees.includes(viewerId) &&
      !!poll?.version &&
      !poll.closed &&
      ["Draft", "Changes requested"].includes(plan.status);
  if (!editable && !poll?.version) return null;
  return (
    <section className="sheet-section availability-section">
      <div className="section-heading">
        <h2>Find a time</h2>
        <span>Africa/Lagos</span>
      </div>
      <p className="field-help">
        Replies show what guests explicitly marked available. Unanswered options
        are not treated as agreement. Save guest-list changes before proposing
        times.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {poll?.version ? (
        <>
          <p>
            {poll.replies.length} of {plan.attendees.length} named guests
            replied{poll.closed ? " · Time chosen; replies are closed." : "."}
          </p>
          <div className="availability-options">
            {poll.ranking.map((rank, index) => {
              const slot = poll.slots.find((s) => s.id === rank.id)!;
              return (
                <div className="availability-row" key={slot.id}>
                  <div>
                    <strong>
                      {dateLabel(slot.date)} · {slot.time}
                    </strong>
                    <span>
                      {slot.durationMinutes} minutes · {rank.available}{" "}
                      available · {rank.unavailable} unavailable ·{" "}
                      {rank.unknown} not replied
                      {index === 0 && rank.available > 0
                        ? " · Best match so far"
                        : ""}
                    </span>
                  </div>
                  {canReply && (
                    <label className="check-option">
                      <input
                        type="checkbox"
                        checked={answers.includes(slot.id)}
                        onChange={(e) =>
                          setAnswers((current) =>
                            e.target.checked
                              ? [...current, slot.id]
                              : current.filter((id) => id !== slot.id),
                          )
                        }
                      />
                      Works for me
                    </label>
                  )}
                  {editable && !poll.closed && (
                    <button
                      className="button button-outline"
                      disabled={
                        busy ||
                        (rank.available < plan.attendees.length &&
                          !acknowledged)
                      }
                      onClick={async () => {
                        setBusy(true);
                        setError("");
                        try {
                          await api(
                            `/plans/${plan.id}/availability/apply`,
                            {
                              version: poll.version,
                              revision: plan.revision,
                              slotId: slot.id,
                              acknowledgeConflicts: acknowledged,
                            },
                            csrf,
                          );
                          await onChanged();
                        } catch (e) {
                          setError(
                            e instanceof Error
                              ? e.message
                              : "The time could not be applied.",
                          );
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Choose this time
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {canReply && (
            <>
              <button
                className="button button-outline"
                disabled={busy}
                onClick={() =>
                  void perform("/reply", {
                    version: poll.version,
                    available: answers,
                  })
                }
              >
                {own ? "Update availability" : "Save availability"}
              </button>
              <p className="field-help">
                Leave every option unchecked to say none of these times works.
              </p>
            </>
          )}
          {editable && !poll.closed && (
            <label className="check-option">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              I understand that some guests may be unavailable or have not
              replied. Applying a time replaces unsaved date/time edits.
            </label>
          )}
          {!!poll.replies.length && (
            <details>
              <summary>Who replied</summary>
              <ul>
                {poll.replies.map((r) => (
                  <li key={r.userId}>
                    {members.find((m) => m.id === r.userId)?.name ?? "Teammate"}{" "}
                    · {r.available.length}{" "}
                    {r.available.length === 1 ? "option" : "options"} available
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <p className="empty-inline">
          Propose two or more times and let your guests choose what works.
        </p>
      )}
      {editable && (
        <button
          className="text-button"
          onClick={() => setEditing(!editing)}
          aria-expanded={editing}
        >
          {poll?.version ? "Propose new times" : "Propose times"}
        </button>
      )}
      {editable && editing && (
        <form
          className="availability-editor"
          onSubmit={(e) => {
            e.preventDefault();
            void perform("", { version: poll?.version ?? 0, slots });
          }}
        >
          <p className="field-help">
            Replacing options clears earlier replies. Guests with outing emails
            enabled receive a request to respond.
          </p>
          {slots.map((slot, index) => (
            <div className="form-grid" key={index}>
              <label className="field">
                Option {index + 1} date
                <input
                  required
                  type="date"
                  min={localDate()}
                  value={slot.date}
                  onChange={(e) =>
                    setSlots((s) =>
                      s.map((x, i) =>
                        i === index ? { ...x, date: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Option {index + 1} time
                <input
                  required
                  type="time"
                  value={slot.time}
                  onChange={(e) =>
                    setSlots((s) =>
                      s.map((x, i) =>
                        i === index ? { ...x, time: e.target.value } : x,
                      ),
                    )
                  }
                />
              </label>
              <label className="field">
                Option {index + 1} duration (minutes)
                <input
                  required
                  type="number"
                  min={30}
                  max={480}
                  value={slot.durationMinutes}
                  onChange={(e) =>
                    setSlots((s) =>
                      s.map((x, i) =>
                        i === index
                          ? { ...x, durationMinutes: Number(e.target.value) }
                          : x,
                      ),
                    )
                  }
                />
              </label>
              {slots.length > 2 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setSlots((s) => s.filter((_, i) => i !== index))
                  }
                >
                  Remove option {index + 1}
                </button>
              )}
            </div>
          ))}
          {slots.length < 6 && (
            <button
              className="text-button"
              type="button"
              onClick={() => setSlots((s) => [...s, { ...s.at(-1)! }])}
            >
              Add another time
            </button>
          )}
          <button className="button button-dark" disabled={busy}>
            Ask for availability
          </button>
        </form>
      )}
    </section>
  );
}
