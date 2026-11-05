// Deterministic test fixtures. Not a production provider or live venue research.
import type {
  AgentProviders,
  ChatMessage,
  ToolCall,
} from "../../agent/providers.ts";
import { ProviderError } from "../../agent/providers.ts";

export function submissionFixture() {
  return {
    summary:
      "Two test-fixture venues with room in the stated budget. Confirm the final terms directly.",
    recommendedIndex: 0,
    options: [
      {
        title: "Lunch at Table House",
        venueName: "Table House",
        location: "Victoria Island, Lagos",
        category: "Good food",
        duration: "2 hours",
        summary: "A shared lunch around one table.",
        reason: "The lower estimate leaves more room for extras.",
        dietaryNotes:
          "Vegetarian options are mentioned; vegan preparation must be confirmed.",
        sourceIds: ["s1"],
        costs: [
          {
            label: "Shared lunch menu",
            amount: 18000,
            unit: "per_person",
            basis: "published",
            sourceId: "s1",
            quote: "Shared lunch menu: NGN18,000 per person.",
          },
          {
            label: "Transport allowance",
            amount: 8000,
            unit: "fixed",
            basis: "estimate",
          },
        ],
        itinerary: [
          {
            time: "13:00",
            title: "Arrive and settle in",
            details:
              "Meet at the venue after the organiser confirms availability.",
          },
          {
            time: "13:30",
            title: "Shared lunch",
            details: "Order after checking dietary requirements.",
          },
        ],
        openQuestions: ["Confirm taxes, service charges and transport costs."],
      },
      {
        title: "Lunch at Garden Room",
        venueName: "Garden Room",
        location: "Ikoyi, Lagos",
        category: "Good food",
        duration: "2 hours",
        summary: "A relaxed lunch in a garden setting.",
        reason: "An alternative with a higher estimated allowance.",
        dietaryNotes: "Ask about vegan options and allergen handling.",
        sourceIds: ["s2"],
        costs: [
          {
            label: "Lunch allowance",
            amount: 20000,
            unit: "per_person",
            basis: "estimate",
          },
          {
            label: "Transport allowance",
            amount: 12000,
            unit: "fixed",
            basis: "estimate",
          },
        ],
        itinerary: [
          {
            time: "13:00",
            title: "Meet at Garden Room",
            details: "Confirm the booking before travelling.",
          },
        ],
        openQuestions: ["Request a current group menu and quote."],
      },
    ],
  };
}
const call = (name: string, args: unknown, index: number): ChatMessage => ({
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: `test-call-${index}`,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    } as ToolCall,
  ],
});
export function fixtureProviders(
  mode:
    | "good"
    | "bad-source"
    | "forged-price"
    | "forbidden-tool"
    | "empty"
    | "slow"
    | "failure" = "good",
): AgentProviders {
  return {
    label: "Deterministic test fixtures — not live research",
    async complete(messages) {
      if (mode === "failure")
        throw new ProviderError("Test provider unavailable.");
      const step = messages.filter(
        (message) => message.role === "assistant",
      ).length;
      if (mode === "forbidden-tool")
        return call("send_email", { to: "someone@example.com" }, step);
      if (step === 0)
        return call("web_search", { query: "group lunch venue menus" }, step);
      if (step === 1)
        return call("read_sources", { sourceIds: ["s1", "s2"] }, step);
      const proposal = submissionFixture();
      if (mode === "bad-source")
        proposal.options[0].sourceIds = ["invented-source"];
      if (mode === "forged-price") proposal.options[0].costs[0].amount = 8000;
      return call("submit_options", proposal, step);
    },
    async search(_query, signal) {
      if (mode === "slow")
        await new Promise<void>((_resolve, reject) => {
          if (signal.aborted) {
            reject(new Error("aborted"));
            return;
          }
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      if (mode === "empty") return [];
      return [
        {
          url: "https://venues.example.com/table-house",
          title: "Table House menus",
          content: "Table House group lunches in Victoria Island.",
        },
        {
          url: "https://venues.example.com/garden-room",
          title: "Garden Room dining",
          content: "Garden Room in Ikoyi.",
        },
      ];
    },
    async extract(urls) {
      return urls.map((url) => ({
        url,
        content: url.includes("table-house")
          ? "Table House, Victoria Island, Lagos. Shared lunch menu: NGN18,000 per person. Vegetarian dishes available. Confirm group dates with the venue."
          : "Garden Room, Ikoyi, Lagos. Group dining enquiries welcome. Request a current menu.",
      }));
    },
  };
}
