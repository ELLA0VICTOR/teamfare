export type Category =
  "All experiences" | "Good food" | "Make something" | "A little adventure";
export type View = "discover" | "plans" | "expenses";
export type Status =
  | "Draft"
  | "Awaiting approval"
  | "Approved"
  | "Changes requested"
  | "Cancelled";
export type Experience = {
  id: string;
  name: string;
  category: Category;
  subtitle: string;
  area: string;
  price: number;
  duration: string;
  image?: string;
  artwork?: "clay" | "court";
  description: string;
  includes: string[];
  capacity: number;
};
export type Plan = {
  id: string;
  experienceId: string;
  title: string;
  date: string;
  time: string;
  people: number;
  budget: number;
  status: Status;
  note: string;
  attendees: string[];
  going: string[];
  location?: string;
  reviewNote?: string;
  declined?: string[];
  events?: PlanEvent[];
  settledAt?: string;
};
export type PlanEvent = {
  id: string;
  at: string;
  text: string;
};
export type Expense = {
  id: string;
  planId: string;
  description: string;
  amount: number;
  payer: string;
  date: string;
  category: string;
};
export type Demo = {
  version: 1;
  plans: Plan[];
  expenses: Expense[];
  saved: string[];
  preference: string;
};
export const members = [
  {
    id: "akin",
    name: "Akin Cole",
    initials: "AC",
    color: "#d4dcae",
    team: "Design",
  },
  {
    id: "nadia",
    name: "Nadia Bello",
    initials: "NB",
    color: "#efb79c",
    team: "People & culture",
  },
  {
    id: "tomi",
    name: "Tomi Ade",
    initials: "TA",
    color: "#d4c8e1",
    team: "Engineering",
  },
  {
    id: "james",
    name: "James Okafor",
    initials: "JO",
    color: "#d0dce3",
    team: "Engineering",
  },
  {
    id: "sarah",
    name: "Sarah Danjuma",
    initials: "SD",
    color: "#e9d79b",
    team: "Design",
  },
  {
    id: "femi",
    name: "Femi Ayo",
    initials: "FA",
    color: "#d5d9cc",
    team: "Product",
  },
  {
    id: "ada",
    name: "Ada Nwosu",
    initials: "AN",
    color: "#edc4c5",
    team: "Product",
  },
  {
    id: "leo",
    name: "Leo Peters",
    initials: "LP",
    color: "#ced9b9",
    team: "Operations",
  },
];
export const experiences: Experience[] = [
  {
    id: "long-table",
    name: "The long lunch",
    category: "Good food",
    subtitle: "Good food. Even better company.",
    area: "Victoria Island, Lagos",
    price: 18500,
    duration: "2–3 hours",
    image: "/images/table.jpg",
    capacity: 20,
    description:
      "A slow afternoon around one big table. Share a seasonal menu, swap stories, and finally have the conversation that never fits into a meeting.",
    includes: [
      "A three-course sharing menu",
      "A private table for your team",
      "Vegetarian options in the sample menu",
      "Time to linger — no presentation required",
    ],
  },
  {
    id: "clay",
    name: "A little clay play",
    category: "Make something",
    subtitle: "Less screen time. More making.",
    area: "Lekki, Lagos",
    price: 22000,
    duration: "2 hours",
    image: "/images/pottery.jpg",
    capacity: 12,
    description:
      "Trade your keyboard for a lump of clay. A relaxed, beginner-friendly making session where the slightly wonky mug is usually everyone’s favourite.",
    includes: [
      "Guided hand-building session",
      "Clay, tools, and apron",
      "Firing of one piece per person",
      "Tea and a very forgiving creative brief",
    ],
  },
  {
    id: "court",
    name: "Meet you on the court",
    category: "A little adventure",
    subtitle: "A friendly bit of healthy competition.",
    area: "Ikoyi, Lagos",
    price: 12000,
    duration: "90 minutes",
    image: "/images/tennis.jpg",
    capacity: 16,
    description:
      "Fresh air, easy rallies, and a little team spirit. Mix up your doubles partners, learn the basics, and leave the competitive spreadsheets at your desk.",
    includes: [
      "Court time and equipment",
      "A beginner-friendly warm-up",
      "Mixed doubles with your team",
      "Water and a post-match breather",
    ],
  },
  {
    id: "supper",
    name: "Stay for supper",
    category: "Good food",
    subtitle: "For the conversations after five.",
    area: "Ikoyi, Lagos",
    price: 24500,
    duration: "2 hours",
    image: "/images/restaurant.jpg",
    capacity: 16,
    description:
      "Gather somewhere with warm lights, a generous table, and nothing on the agenda except catching up. An easy way to make a regular evening feel a little different.",
    includes: [
      "Reserved group table",
      "A seasonal dinner menu",
      "Alcohol-free welcome drink",
      "Dietary preferences collected before approval",
    ],
  },
];
export function localDate(offset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", options);
export const experienceFor = (id: string) =>
  experiences.find((experience) => experience.id === id)!;
export const initialDemo: Demo = {
  version: 1,
  saved: [],
  preference: "No preference",
  plans: [
    {
      id: "sample-lunch",
      experienceId: "long-table",
      title: "A proper team catch-up",
      date: localDate(8),
      time: "13:00",
      people: 8,
      budget: 180000,
      status: "Approved",
      note: "A long lunch for the whole crew. No laptops, please.",
      attendees: members.map((member) => member.id),
      going: ["nadia", "tomi", "sarah", "femi", "ada"],
    },
    {
      id: "sample-clay",
      experienceId: "clay",
      title: "Something a little hands-on",
      date: localDate(16),
      time: "15:00",
      people: 6,
      budget: 150000,
      status: "Awaiting approval",
      note: "A creative afternoon for design and product.",
      attendees: ["akin", "nadia", "sarah", "femi", "ada", "leo"],
      going: ["nadia", "sarah"],
    },
  ],
  expenses: [
    {
      id: "sample-expense",
      planId: "sample-lunch",
      description: "Lunch deposit",
      amount: 60000,
      payer: "Nadia Bello",
      date: localDate(-1),
      category: "Food & drinks",
    },
  ],
};
export const storageKey = "teamfare-preview-v1";
export function loadDemo(): Demo {
  try {
    const data: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? "null",
    );
    if (
      data &&
      typeof data === "object" &&
      "version" in data &&
      data.version === 1 &&
      "plans" in data &&
      Array.isArray(data.plans) &&
      "expenses" in data &&
      Array.isArray(data.expenses) &&
      "saved" in data &&
      Array.isArray(data.saved)
    )
      return {
        ...(data as Demo),
        plans: (data as Demo).plans.map((plan) => ({
          ...plan,
          declined: plan.declined ?? [],
          events: plan.events ?? [],
        })),
      };
  } catch {
    /* Unavailable storage starts a fresh preview. */
  }
  return structuredClone(initialDemo);
}
