// Collapse a filing + its transactions into a single display row.
//
// A Form 4 can list several transactions; for the dashboard we pick one
// "representative" transaction: prefer an open-market buy/sell (code P/S),
// then the largest by notional value. That drives the Type / Shares / Price /
// Value columns and the buy/sell filter.

import type { FilingDetail, FilingSummary, TransactionRow } from "./types";
import { relationship, txCodeLabel } from "./format";

function notional(t: TransactionRow): number {
  return (t.shares ?? 0) * (t.price_per_share ?? 0);
}

function pickPrimary(txs: TransactionRow[]): TransactionRow | null {
  if (!txs || txs.length === 0) return null;
  return [...txs].sort((a, b) => {
    const aOpen = a.transaction_code === "P" || a.transaction_code === "S" ? 1 : 0;
    const bOpen = b.transaction_code === "P" || b.transaction_code === "S" ? 1 : 0;
    if (aOpen !== bOpen) return bOpen - aOpen;
    return notional(b) - notional(a);
  })[0];
}

export function summarize(f: FilingDetail): FilingSummary {
  const t = pickPrimary(f.transactions ?? []);
  const shares = t?.shares ?? null;
  const price = t?.price_per_share ?? null;
  const value = shares != null && price != null ? shares * price : null;
  const direction = (t?.acquired_disposed === "A" || t?.acquired_disposed === "D"
    ? t.acquired_disposed
    : null) as "A" | "D" | null;

  return {
    accession_no: f.accession_no,
    filing_date: f.filing_date,
    form_type: f.form_type,
    ticker: f.issuers?.ticker ?? null,
    company: f.issuers?.name ?? null,
    companyCik: f.issuers?.cik ?? null,
    insider: f.insiders?.name ?? null,
    insiderCik: f.insiders?.cik ?? null,
    relationship: relationship(f.is_director, f.is_officer, f.is_ten_pct, f.insider_title),
    code: t?.transaction_code ?? null,
    codeLabel: txCodeLabel(t?.transaction_code ?? null),
    direction,
    isPurchase: t?.transaction_code === "P",
    isSale: t?.transaction_code === "S",
    shares,
    price,
    value,
  };
}
