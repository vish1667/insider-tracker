// All read queries used by the pages, in one place.

import { supabase } from "./supabase";
import type { FilingRow, FilingDetail } from "./types";

const FILING_SELECT =
  "accession_no, form_type, filing_date, period_of_report, insider_title, is_director, is_officer, is_ten_pct, source_url, raw_xml_url, issuers(cik, name, ticker), insiders(cik, name)";

/** Newest filings for the dashboard. */
export async function getLatestFilings(limit = 50): Promise<FilingRow[]> {
  const { data, error } = await supabase
    .from("filings")
    .select(FILING_SELECT)
    .order("filing_date", { ascending: false })
    .order("ingested_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilingRow[];
}

/**
 * Search by ticker, company name, or insider name.
 * Strategy: resolve matching issuer/insider CIKs first (trigram-ish ilike),
 * then fetch filings referencing them. Simple and index-friendly.
 */
export async function searchFilings(q: string, limit = 100): Promise<FilingRow[]> {
  const term = q.trim();
  if (!term) return [];

  const like = `%${term}%`;

  const [issuersRes, insidersRes] = await Promise.all([
    supabase.from("issuers").select("cik").or(`name.ilike.${like},ticker.ilike.${like}`).limit(50),
    supabase.from("insiders").select("cik").ilike("name", like).limit(50),
  ]);

  if (issuersRes.error) throw new Error(issuersRes.error.message);
  if (insidersRes.error) throw new Error(insidersRes.error.message);

  const issuerCiks = (issuersRes.data ?? []).map((r) => r.cik as number);
  const insiderCiks = (insidersRes.data ?? []).map((r) => r.cik as number);

  if (issuerCiks.length === 0 && insiderCiks.length === 0) return [];

  const orParts: string[] = [];
  if (issuerCiks.length) orParts.push(`issuer_cik.in.(${issuerCiks.join(",")})`);
  if (insiderCiks.length) orParts.push(`insider_cik.in.(${insiderCiks.join(",")})`);

  const { data, error } = await supabase
    .from("filings")
    .select(FILING_SELECT)
    .or(orParts.join(","))
    .order("filing_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilingRow[];
}

/** One filing + its transactions, by accession number. */
export async function getFilingByAccession(accession: string): Promise<FilingDetail | null> {
  const { data, error } = await supabase
    .from("filings")
    .select(`${FILING_SELECT}, transactions(*)`)
    .eq("accession_no", accession)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const detail = data as unknown as FilingDetail;
  detail.transactions = (detail.transactions ?? []).sort((a, b) => a.line_no - b.line_no);
  return detail;
}

/** All filings for one issuer (company history page). */
export async function getFilingsByIssuer(cik: number, limit = 200): Promise<FilingRow[]> {
  const { data, error } = await supabase
    .from("filings")
    .select(FILING_SELECT)
    .eq("issuer_cik", cik)
    .order("filing_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilingRow[];
}

/** All filings by one insider (insider history page). */
export async function getFilingsByInsider(cik: number, limit = 200): Promise<FilingRow[]> {
  const { data, error } = await supabase
    .from("filings")
    .select(FILING_SELECT)
    .eq("insider_cik", cik)
    .order("filing_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as FilingRow[];
}
