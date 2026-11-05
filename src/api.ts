import type { Connection } from "./team-context";
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  body?: unknown,
  csrf?: string,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response
    .json()
    .catch(() => ({ error: "The server returned an unreadable response." }));
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error ?? "The request could not be completed.",
    );
  return result as T;
}
export const getSession = () => api<Connection | { user: null }>("/session");
export async function uploadReceipt(
  expenseId: string,
  file: File,
  csrf: string,
) {
  if (
    !file.size ||
    file.size > 5 * 1024 * 1024 ||
    !["image/png", "image/jpeg", "application/pdf"].includes(file.type)
  )
    throw new Error("Choose a PDF, JPEG or PNG receipt up to 5 MB.");
  const response = await fetch(
    `/api/expenses/${encodeURIComponent(expenseId)}/receipt`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": file.type,
        "X-CSRF-Token": csrf,
        "X-Receipt-Name": encodeURIComponent(file.name),
      },
      body: file,
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error ?? "Receipt upload failed.",
    );
  return result;
}
