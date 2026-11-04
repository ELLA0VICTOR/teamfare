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
