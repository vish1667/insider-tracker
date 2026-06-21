// Display helpers: turn raw SEC codes/numbers into readable text.

// Form 4 transaction codes → human labels (the common ones).
const TX_CODES: Record<string, string> = {
  P: "Purchase",
  S: "Sale",
  A: "Grant/Award",
  D: "Disposition to issuer",
  F: "Tax withholding",
  M: "Option exercise",
  G: "Gift",
  C: "Conversion",
  X: "Option exercise",
  J: "Other acquisition",
  K: "Equity swap",
  V: "Voluntary report",
};

export function txCodeLabel(code: string | null): string {
  if (!code) return "—";
  return TX_CODES[code] ? `${code} · ${TX_CODES[code]}` : code;
}

export function fmtNumber(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

export function fmtMoney(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  // s is YYYY-MM-DD; render as-is to avoid timezone shifting.
  return s;
}

/** Director / Officer / 10% owner badge text from the relationship flags. */
export function relationship(
  isDirector: boolean | null,
  isOfficer: boolean | null,
  isTenPct: boolean | null,
  title: string | null
): string {
  const parts: string[] = [];
  if (isDirector) parts.push("Director");
  if (isOfficer) parts.push(title ? `Officer (${title})` : "Officer");
  if (isTenPct) parts.push("10% Owner");
  return parts.length ? parts.join(", ") : title ?? "—";
}

/** A → green (acquired), D → red (disposed). */
export function acquiredColor(code: string | null): string {
  if (code === "A") return "var(--green)";
  if (code === "D") return "var(--red)";
  return "inherit";
}
