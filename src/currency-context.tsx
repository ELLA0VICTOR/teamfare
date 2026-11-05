import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  convertedMoney,
  displayAmount,
  formatAmount,
  referenceQuote,
  sourceAmount,
  sourceCurrencyText,
} from "./currency";
import type { CurrencyQuote, DisplayCurrency } from "./currency";

const preferenceKey = "teamfare-display-currency-v1";
const CurrencyContext = createContext({
  currency: "USD" as DisplayCurrency,
  quote: referenceQuote,
  setCurrency: (_value: DisplayCurrency) => {},
  lockQuote: () => {},
});
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCode] = useState<DisplayCurrency>(() => {
    try {
      return localStorage.getItem(preferenceKey) === "NGN" ? "NGN" : "USD";
    } catch {
      return "USD";
    }
  });
  const [quote, setQuote] = useState(referenceQuote),
    locked = useRef(false);
  useEffect(() => {
    if (sessionStorage.getItem("teamfare-mode") === "preview") return;
    const controller = new AbortController();
    void fetch("/api/currency", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const q = (await r.json()) as CurrencyQuote;
        if (
          !locked.current &&
          q.id &&
          q.source === referenceQuote.source &&
          Number.isFinite(q.ngnPerUsd) &&
          q.ngnPerUsd > 0 &&
          Number.isFinite(Date.parse(q.updatedAt))
        )
          setQuote(q);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  function setCurrency(value: DisplayCurrency) {
    setCode(value);
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* The current tab still keeps the choice. */
    }
  }
  return (
    <CurrencyContext.Provider
      value={{
        currency,
        quote,
        setCurrency,
        lockQuote: () => {
          locked.current = true;
        },
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
}
// oxlint-disable-next-line react/only-export-components -- This hook shares the provider's single context.
export function useCurrency() {
  const context = useContext(CurrencyContext),
    { currency, quote } = context;
  return {
    ...context,
    money: (ngn: number) => convertedMoney(ngn, currency, quote),
    display: (ngn: number) => displayAmount(ngn, currency, quote),
    source: (amount: number) => sourceAmount(amount, currency, quote),
    format: (amount: number) => formatAmount(amount, currency),
    text: (value: string) => sourceCurrencyText(value, currency, quote),
    moneySum: (values: number[]) =>
      formatAmount(
        values.reduce(
          (sum, v) => sum + Math.round(displayAmount(v, currency, quote) * 100),
          0,
        ) / 100,
        currency,
      ),
    difference: (budget: number, total: number) =>
      formatAmount(
        Math.abs(
          Math.round(displayAmount(budget, currency, quote) * 100) -
            Math.round(displayAmount(total, currency, quote) * 100),
        ) / 100,
        currency,
      ),
  };
}
export function CurrencySwitch() {
  const { currency, setCurrency } = useCurrency();
  return (
    <label className="currency-switch">
      <span className="sr-only">Display currency</span>
      <select
        value={currency}
        onChange={(e) => setCurrency(e.target.value as DisplayCurrency)}
      >
        <option value="USD">USD</option>
        <option value="NGN">NGN</option>
      </select>
    </label>
  );
}
export function CurrencyNotice() {
  const { currency, quote } = useCurrency();
  if (currency === "NGN") return null;
  return (
    <p className="currency-notice">
      USD equivalents · $1 = ₦
      {quote.ngnPerUsd.toLocaleString("en-US", { maximumFractionDigits: 2 })} ·{" "}
      {new Date(quote.updatedAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })}
      . Rounded estimates; records and approval checks keep the original NGN
      amounts.{" "}
      <a href={quote.source} target="_blank" rel="noopener noreferrer">
        Rates By Exchange Rate API
      </a>
    </p>
  );
}
type MoneyInputProps = {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  name?: string;
  required?: boolean;
  grouped?: boolean;
};
export function MoneyInput(props: MoneyInputProps) {
  const { currency } = useCurrency();
  return <CurrencyMoneyInput key={currency} {...props} />;
}
function CurrencyMoneyInput({
  value,
  onValueChange,
  min = 0,
  max = 100000000,
  name,
  required = true,
  grouped = false,
}: MoneyInputProps) {
  const { currency, display, source, lockQuote } = useCurrency();
  const [editing, setEditing] = useState<string | null>(null);
  const rendered =
    currency === "USD"
      ? display(value).toFixed(2)
      : grouped
        ? value.toLocaleString("en-NG")
        : String(value);
  return (
    <input
      key={currency}
      name={name}
      required={required}
      type="text"
      inputMode={currency === "USD" ? "decimal" : "numeric"}
      value={editing ?? rendered}
      onFocus={() => {
        lockQuote();
        setEditing(rendered);
      }}
      onBlur={(e) => {
        if (e.currentTarget.validity.valid && editing !== "") setEditing(null);
      }}
      onChange={(e) => {
        const raw = e.target.value.replaceAll(",", "");
        if (!(currency === "USD" ? /^\d*(?:\.\d{0,2})?$/ : /^\d*$/).test(raw))
          return;
        setEditing(
          currency === "NGN" && grouped && raw !== ""
            ? Number(raw).toLocaleString("en-NG")
            : raw,
        );
        const amount = source(Number(raw));
        const valid =
          raw !== "" &&
          Number.isFinite(Number(raw)) &&
          Number.isSafeInteger(amount) &&
          amount >= min &&
          amount <= max;
        e.target.setCustomValidity(
          raw !== "" && !valid
            ? `Enter an amount from ${display(min)} to ${display(max)} ${currency}.`
            : "",
        );
        if (raw === "" || valid) onValueChange(raw === "" ? 0 : amount);
      }}
    />
  );
}
