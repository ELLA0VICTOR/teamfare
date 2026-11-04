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
export function needsYou(plan: Plan, role: Role, viewerId = "akin") {
  const owns = plan.createdBy
    ? plan.createdBy === viewerId
    : role === "employee";
  return (
    (role === "manager" &&
      plan.status === "Awaiting approval" &&
      plan.createdBy !== viewerId) ||
    (owns &&
      (plan.status === "Draft" || plan.status === "Changes requested")) ||
    (plan.status === "Approved" &&
      (role === "employee" || !!plan.createdBy) &&
      !plan.settledAt &&
      plan.date >= localDate() &&
      plan.attendees.includes(viewerId) &&
      !plan.going.includes(viewerId) &&
      !plan.declined?.includes(viewerId))
  );
}
export const totalFor = (plan: Plan) => priceFor(plan) * plan.people;
export const priceFor = (plan: Plan) =>
  plan.unitPrice ?? experienceFor(plan.experienceId).price;
export const placeFor = (plan: Plan) =>
  plan.location || experienceFor(plan.experienceId).area;
export const nextAction = (plan: Plan, role: Role, viewerId = "akin") =>
  plan.status === "Awaiting approval"
    ? role === "manager" && plan.createdBy !== viewerId
      ? "Review proposal"
      : "View proposal"
    : ["Draft", "Changes requested"].includes(plan.status)
      ? "Continue planning"
      : needsYou(plan, role, viewerId)
        ? "RSVP"
        : plan.status === "Cancelled"
          ? "View record"
          : "View plan";
export function event(text: string): PlanEvent {
  return { id: crypto.randomUUID(), at: new Date().toISOString(), text };
}
