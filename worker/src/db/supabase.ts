// Supabase client + all DB writes for the worker.
// Uses the service-role key, so it bypasses RLS — keep this server-side only.

import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type { Form4IndexEntry } from "../edgar/index-fetcher.js";
import type { ParsedForm4 } from "../edgar/form4-parser.js";

export const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

/**
 * Return the set of accession numbers (from the given list) already stored.
 * Batched: a single `.in()` over a full daily index (~1.7k accessions) builds a
 * query string tens of KB long, which the HTTP layer rejects as "fetch failed".
 */
export async function findExistingAccessions(accessions: string[]): Promise<Set<string>> {
  if (accessions.length === 0) return new Set();
  const CHUNK = 200;
  const found = new Set<string>();
  for (let i = 0; i < accessions.length; i += CHUNK) {
    const batch = accessions.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("filings")
      .select("accession_no")
      .in("accession_no", batch);
    if (error) throw new Error(`findExistingAccessions failed: ${error.message}`);
    for (const r of data ?? []) found.add(r.accession_no as string);
  }
  return found;
}

/** Upsert an issuer by CIK (idempotent). No-op if CIK is missing. */
async function upsertIssuer(cik: number | null, name: string | null, ticker: string | null) {
  if (cik == null) return;
  const { error } = await supabase
    .from("issuers")
    .upsert(
      { cik, name: name ?? "Unknown", ticker: ticker ?? null, updated_at: new Date().toISOString() },
      { onConflict: "cik" }
    );
  if (error) throw new Error(`upsertIssuer(${cik}) failed: ${error.message}`);
}

/** Upsert an insider by CIK (idempotent). No-op if CIK is missing. */
async function upsertInsider(cik: number | null, name: string | null) {
  if (cik == null) return;
  const { error } = await supabase
    .from("insiders")
    .upsert(
      { cik, name: name ?? "Unknown", updated_at: new Date().toISOString() },
      { onConflict: "cik" }
    );
  if (error) throw new Error(`upsertInsider(${cik}) failed: ${error.message}`);
}

/**
 * Persist one fully-parsed Form 4: issuer, insider, filing, transactions.
 * Idempotent — relies on the accession_no unique constraint and
 * (filing_id, line_no) unique constraint. Returns true if a new filing row
 * was inserted, false if it already existed.
 */
export async function saveFiling(entry: Form4IndexEntry, parsed: ParsedForm4): Promise<boolean> {
  // Foreign keys first so the filing insert never dangles.
  await upsertIssuer(parsed.issuerCik, parsed.issuerName ?? entry.companyName, parsed.issuerTicker);
  await upsertInsider(parsed.insiderCik, parsed.insiderName);

  const { data: filingRow, error: filingErr } = await supabase
    .from("filings")
    .upsert(
      {
        accession_no: entry.accessionNo,
        form_type: entry.formType,
        issuer_cik: parsed.issuerCik,
        insider_cik: parsed.insiderCik,
        filing_date: entry.dateFiled,
        period_of_report: parsed.periodOfReport,
        insider_title: parsed.insiderTitle,
        is_director: parsed.isDirector,
        is_officer: parsed.isOfficer,
        is_ten_pct: parsed.isTenPct,
        source_url: entry.sourceUrl,
        raw_xml_url: entry.submissionTxtUrl,
      },
      { onConflict: "accession_no" }
    )
    .select("id")
    .single();

  if (filingErr) throw new Error(`saveFiling upsert failed: ${filingErr.message}`);
  const filingId = filingRow!.id as number;

  if (parsed.transactions.length > 0) {
    const rows = parsed.transactions.map((t, i) => ({
      filing_id: filingId,
      security_title: t.securityTitle,
      is_derivative: t.isDerivative,
      transaction_date: t.transactionDate,
      transaction_code: t.transactionCode,
      shares: t.shares,
      price_per_share: t.pricePerShare,
      acquired_disposed: t.acquiredDisposed,
      shares_owned_after: t.sharesOwnedAfter,
      ownership_type: t.ownershipType,
      footnote_ids: t.footnoteIds,
      line_no: i,
    }));
    const { error: txErr } = await supabase
      .from("transactions")
      .upsert(rows, { onConflict: "filing_id,line_no" });
    if (txErr) throw new Error(`saveFiling transactions upsert failed: ${txErr.message}`);
  }

  return true;
}

// ---- ingestion run logging -------------------------------------------------

export async function startRun(targetDate: string): Promise<number> {
  const { data, error } = await supabase
    .from("ingestion_runs")
    .insert({ target_date: targetDate, status: "running" })
    .select("id")
    .single();
  if (error) throw new Error(`startRun failed: ${error.message}`);
  return data!.id as number;
}

export async function finishRun(
  id: number,
  fields: { filings_seen: number; filings_new: number; errors: number; status: string; notes?: string }
): Promise<void> {
  const { error } = await supabase
    .from("ingestion_runs")
    .update({ ...fields, finished_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(`finishRun failed: ${error.message}`);
}
