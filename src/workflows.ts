import type { Expense, Plan } from "./data.ts";

export type Receipt = {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
};
export type ReportFilter = { planId?: string; from?: string; to?: string };
export function filteredExpenses(expenses: Expense[], filter: ReportFilter) {
  return expenses.filter(
    (e) =>
      (!filter.planId || e.planId === filter.planId) &&
      (!filter.from || e.date >= filter.from) &&
      (!filter.to || e.date <= filter.to),
  );
}
export function expenseCsv(expenses: Expense[], plans: Plan[]) {
  const cell = (value: string | number) => {
    const raw = String(value),
      safe = /^(?:\s*[=+@-]|[\t\r\n])/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      ["Date", "Outing", "Description", "Category", "Paid by", "Amount (NGN)"],
      ...expenses.map((e) => [
        e.date,
        plans.find((p) => p.id === e.planId)?.title ?? "",
        e.description,
        e.category,
        e.payer,
        e.amount,
      ]),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
export type AvailabilitySlot = {
  id: string;
  date: string;
  time: string;
  durationMinutes: number;
};
export type Availability = {
  version: number;
  closed: boolean;
  slots: AvailabilitySlot[];
  replies: { userId: string; available: string[]; repliedAt: string }[];
  ranking: {
    id: string;
    available: number;
    unavailable: number;
    unknown: number;
  }[];
};
export type WorkflowEmail = {
  id: string;
  kind: string;
  recipient: string;
  status:
    "pending" | "sending" | "accepted" | "failed" | "suppressed" | "cancelled";
  attempts: number;
  scheduledAt: string;
  acceptedAt?: string;
  error?: string;
};
export const outingStart = (plan: Pick<Plan, "date" | "time">) =>
  new Date(`${plan.date}T${plan.time}:00+01:00`);
export function calendarFile(plan: Plan, origin: string) {
  const stamp = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const escape = (text: string) =>
    text
      .replaceAll("\\", "\\\\")
      .replace(/\r\n|\r|\n/g, "\\n")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,");
  const start = outingStart(plan),
    end = new Date(start.getTime() + (plan.durationMinutes ?? 120) * 60000);
  // Fold at 75 octets without splitting UTF-8 characters (RFC 5545).
  const fold = (line: string) => {
    let out = "",
      column = 0;
    for (const char of line) {
      const bytes = new TextEncoder().encode(char).length;
      if (column + bytes > 75) {
        out += "\r\n ";
        column = 1;
      }
      out += char;
      column += bytes;
    }
    return out;
  };
  const cancelled = plan.status === "Cancelled";
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Teamfare//Outings//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${escape(plan.id)}@teamfare`,
      `SEQUENCE:${plan.revision ?? 1}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${escape(plan.title)}`,
      `LOCATION:${escape(plan.location ?? plan.proposal?.location ?? "")}`,
      `DESCRIPTION:${escape((plan.note ?? "") + "\nRSVP and current details: " + origin + "/#plan/" + encodeURIComponent(plan.id) + "\nVenue arrangements need organiser confirmation.")}`,
      `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
