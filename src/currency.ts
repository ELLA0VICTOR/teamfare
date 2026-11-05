export type DisplayCurrency = "USD" | "NGN";
export type CurrencyQuote = {
  id: string;
  ngnPerUsd: number;
  updatedAt: string;
  nextUpdateAt: string;
  source: "https://www.exchangerate-api.com";
};

// Cached provider response checked on 5 November 2026. The API refreshes it
// after nextUpdateAt; this dated reference remains available during an outage.
export const referenceQuote: CurrencyQuote = {
  id: "usd-ngn-1793836951-1346.474525",
  ngnPerUsd: 1346.474525,
  updatedAt: "2026-11-05T00:02:31.000Z",
  nextUpdateAt: "2026-11-06T00:22:21.000Z",
  source: "https://www.exchangerate-api.com",
};

export function displayAmount(
  ngn: number,
  currency: DisplayCurrency,
  quote: CurrencyQuote,
) {
  return currency === "USD"
    ? Math.round((ngn / quote.ngnPerUsd + Number.EPSILON) * 100) / 100
    : ngn;
}
export function sourceAmount(
  amount: number,
  currency: DisplayCurrency,
  quote: CurrencyQuote,
) {
  return currency === "USD" ? Math.round(amount * quote.ngnPerUsd) : amount;
}
export function formatAmount(amount: number, currency: DisplayCurrency) {
  return new Intl.NumberFormat(currency === "USD" ? "en-US" : "en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0,
  }).format(amount);
}
export function convertedMoney(
  ngn: number,
  currency: DisplayCurrency,
  quote: CurrencyQuote,
) {
  return formatAmount(displayAmount(ngn, currency, quote), currency);
}
export function sourceCurrencyText(
  text: string,
  currency: DisplayCurrency,
  quote: CurrencyQuote,
) {
  if (currency === "NGN") return text;
  return text.replace(
    /(?:₦\s*|NGN\s*)(\d+(?:,\d{3})*(?:\.\d+)?)|(\d+(?:,\d{3})*(?:\.\d+)?)\s+naira\b/gi,
    (_match, prefix: string | undefined, suffix: string | undefined) =>
      convertedMoney(
        Number((prefix ?? suffix)!.replaceAll(",", "")),
        currency,
        quote,
      ),
  );
}
