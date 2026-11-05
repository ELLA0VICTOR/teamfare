import { useState } from "react";
import type { Expense } from "../data";
import { api, uploadReceipt } from "../api";
import { useTeam } from "../team-context";
export function ReceiptControl({
  expense,
  csrf,
  onChanged,
  locked = false,
}: {
  expense: Expense;
  csrf: string;
  onChanged: () => Promise<void>;
  locked?: boolean;
}) {
  const { viewerId, members } = useTeam(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  const manager = members.find((m) => m.id === viewerId)?.role === "manager";
  if (
    !manager &&
    expense.createdBy !== viewerId &&
    expense.payerId !== viewerId
  )
    return null;
  return (
    <div className="receipt-control">
      {expense.receipt ? (
        <>
          <a
            className="text-button"
            href={`/api/expenses/${encodeURIComponent(expense.id)}/receipt`}
          >
            Download receipt · {expense.receipt.name}
          </a>
          {locked ? null : confirm ? (
            <div>
              <span>Remove this receipt?</span>
              <button
                className="text-button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await api(
                      `/expenses/${expense.id}/receipt`,
                      { receiptId: expense.receipt!.id },
                      csrf,
                      "DELETE",
                    );
                    await onChanged();
                    setConfirm(false);
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Receipt could not be removed.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Remove receipt
              </button>
              <button className="text-button" onClick={() => setConfirm(false)}>
                Keep receipt
              </button>
            </div>
          ) : (
            <button className="text-button" onClick={() => setConfirm(true)}>
              Remove receipt
            </button>
          )}
        </>
      ) : locked ? null : (
        <label className="receipt-picker">
          {busy ? "Uploading receipt…" : "Attach receipt"}
          <input
            type="file"
            disabled={busy}
            accept="application/pdf,image/jpeg,image/png"
            aria-label={`Receipt for ${expense.description}`}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                await uploadReceipt(expense.id, file, csrf);
                await onChanged();
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Receipt upload failed.",
                );
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
      )}
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
