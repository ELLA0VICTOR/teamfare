import { experienceFor, localDate } from "./data";
import type { Plan, PlanEvent } from "./data";

export type Role = "employee" | "manager";
export const stages = ["Idea", "Proposed", "Approved", "Happening", "Settled"];
export function stageOf(plan: Plan) {
  if (plan.status === "Cancelled") return -1;
  if (plan.status === "Draft" || plan.status === "Changes requested") return 0;
  if (plan.status === "Awaiting approval") return 1;
  if (plan.settledAt) return 4;
  return plan.date <= localDate() ? 3 : 2;
}
export function needsYou(plan: Plan, role: Role) {
  return role === "manager"
    ? plan.status === "Awaiting approval"
    : plan.status === "Draft" ||
        plan.status === "Changes requested" ||
        (plan.status === "Approved" &&
          !plan.settledAt &&
          plan.date >= localDate() &&
          plan.attendees.includes("akin") &&
          !plan.going.includes("akin") &&
          !plan.declined?.includes("akin"));
}
export const totalFor = (plan: Plan) =>
  experienceFor(plan.experienceId).price * plan.people;
export const placeFor = (plan: Plan) =>
  plan.location || experienceFor(plan.experienceId).area;
export const nextAction = (plan: Plan, role: Role) =>
  plan.status === "Awaiting approval"
    ? role === "manager"
      ? "Review proposal"
      : "View proposal"
    : ["Draft", "Changes requested"].includes(plan.status)
      ? "Continue planning"
      : needsYou(plan, role)
        ? "RSVP"
        : plan.status === "Cancelled"
          ? "View record"
          : "View plan";
export function event(text: string): PlanEvent {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), text };
}
