import { createContext, useContext } from "react";
import { members as samples } from "./data";
import type { Demo } from "./data";
export type Member = {
  id: string;
  name: string;
  initials: string;
  team: string;
  role?: "employee" | "manager";
};
export type Connection = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "employee" | "manager";
  };
  team: { id: string; name: string };
  members: Member[];
  csrfToken: string;
  state: Demo;
};
export const TeamContext = createContext({
  live: false,
  viewerId: "akin",
  viewerName: "Akin Cole",
  managerName: "Nadia Bello",
  members: samples as Member[],
  teamName: "Koto team",
});
export const useTeam = () => useContext(TeamContext);
