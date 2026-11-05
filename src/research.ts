import type { Category } from "./data.ts";

export type ResearchInput = {
  brief: string;
  people: number;
  location: string;
  date: string;
  perPerson: number;
  preference: string;
};
export type EvidenceSource = {
  id: string;
  url: string;
  title: string;
  excerpt: string;
  fetchedAt: string;
  read: boolean;
};
export type CostLine = {
  label: string;
  amount: number;
  unit: "per_person" | "fixed";
  basis: "estimate" | "published";
  sourceId?: string;
  quote?: string;
};
export type ItineraryItem = { time: string; title: string; details: string };
export type ResearchOption = {
  id: string;
  title: string;
  venueName: string;
  location: string;
  category: Exclude<Category, "All experiences">;
  duration: string;
  summary: string;
  reason: string;
  dietaryNotes: string;
  costs: CostLine[];
  itinerary: ItineraryItem[];
  sources: EvidenceSource[];
  openQuestions: string[];
};
export type ResearchedProposal = ResearchOption & {
  runId: string;
  organiserEdited?: boolean;
};
export type ResearchResult = {
  summary: string;
  options: ResearchOption[];
  recommendedOptionId: string;
  limitations: string[];
};
export type ResearchRun = {
  provider?: string;
  id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  input: ResearchInput;
  createdAt: string;
  updatedAt: string;
  events: { at: string; text: string }[];
  result?: ResearchResult;
  error?: string;
  selectedPlanId?: string;
  selectedOptionId?: string;
};
export type AgentSetup = {
  ready: boolean;
  provider: string;
  missing: string[];
};
export const costTotal = (costs: CostLine[], people: number) =>
  costs.reduce(
    (sum, line) =>
      sum + line.amount * (line.unit === "per_person" ? people : 1),
    0,
  );
