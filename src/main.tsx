import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import Root from "./Root.tsx";
import { CurrencyProvider } from "./currency-context";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <CurrencyProvider>
      <Root />
    </CurrencyProvider>
  </StrictMode>,
);
