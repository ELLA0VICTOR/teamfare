import { experienceFor, experiences, localDate } from "./data";
import type { Experience } from "./data";
import { costTotal } from "./research";
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
export const totalFor = (plan: Plan) =>
  plan.proposal
    ? costTotal(plan.proposal.costs, plan.people)
    : priceFor(plan) * plan.people;
export const priceFor = (plan: Plan) =>
  plan.proposal
    ? costTotal(plan.proposal.costs, plan.people) / Math.max(1, plan.people)
    : (plan.unitPrice ?? experienceFor(plan.experienceId).price);
export const placeFor = (plan: Plan) =>
  plan.location || planExperience(plan).area;
export function planExperience(plan: Plan): Experience {
  if (!plan.proposal) return experienceFor(plan.experienceId);
  const proposal = plan.proposal;
  return {
    id: "researched",
    name: proposal.venueName,
    category: proposal.category,
    subtitle: proposal.summary,
    area: placeForLocation(plan),
    price: priceFor(plan),
    duration: proposal.duration,
    description: proposal.summary,
    includes: [proposal.summary],
    capacity: 20,
    image: experiences.find((item) => item.category === proposal.category)
      ?.image,
  };
}
function placeForLocation(plan: Plan) {
  return plan.location || plan.proposal?.location || "Location to confirm";
}
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
