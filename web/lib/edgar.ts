// Direct SEC EDGAR data layer — no database required.
// Parallel XML fetching (10 concurrent) with in-memory cache.

import { FilingDetail, TransactionRow } from "./types";

const SEC_BASE = "https://www.sec.gov";
const DATA_BASE = "https://data.sec.gov";
const MAX_RETRIES = 3;
const BACKOFF_MS = 600;
const LOOKBACK_DAYS = 7;
const CONCURRENCY = 10;     // parallel XML fetches per batch
const BATCH_PAUSE_MS = 1000; // 10 req/s = SEC limit
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ---- in-memory cache --------------------------------------------------------

const memCache = new Map<string, { value: unknown; exp: number }>();

function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memCache.get(key) as { value: T; exp: number } | undefined;
  if (hit && hit.exp > now) return Promise.resolve(hit.value);
  return fn().then((v) => {
    memCache.set(key, { value: v, exp: now + CACHE_TTL_MS });
    return v;
  });
}

export function invalidateCache() {
  memCache.clear();
}

// ---- fetcher ----------------------------------------------------------------

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function ua() {
  return process.env.SEC_USER_AGENT ?? "InsiderTracker contact@example.com";
}

async function edgarGet(url: string): Promise<string> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": ua() },
        cache: "no-store",
      });
      if (res.status === 404) throw Object.assign(new Error("NOT_FOUND"), { notFound: true });
      if (res.status === 429 || res.status >= 500) {
        await sleep(BACKOFF_MS * 2 ** attempt);
        continue;
      }
      if (!res.ok) throw new Error(`EDGAR ${res.status} ${url}`);
      return res.text();
    } catch (err) {
      if ((err as { notFound?: boolean }).notFound) throw err;
      if (attempt === MAX_RETRIES) throw err;
      await sleep(BACKOFF_MS * 2 ** attempt);
    }
  }
  throw new Error(`EDGAR retries exhausted: ${url}`);
}

async function edgarGetJson<T>(url: string): Promise<T> {
  return JSON.parse(await edgarGet(url)) as T;
}

// ---- daily index ------------------------------------------------------------

export interface IndexEntry {
  cik: number;
  companyName: string;
  formType: string;
  dateFiled: string;
  accessionNo: string;
  submissionTxtUrl: string;
  sourceUrl: string;
}

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function yyyymmdd(d: Date) { return isoDate(d).replace(/-/g, ""); }
function quarterOf(m: number) { return Math.floor((m - 1) / 3) + 1; }

async function fetchDailyIndex(date: Date): Promise<IndexEntry[]> {
  const y = date.getUTCFullYear();
  const q = quarterOf(date.getUTCMonth() + 1);
  const url = `${SEC_BASE}/Archives/edgar/daily-index/${y}/QTR${q}/master.${yyyymmdd(date)}.idx`;
  let raw: string;
  try { raw = await edgarGet(url); } catch { return []; }

  const out: IndexEntry[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|");
    if (parts.length !== 5) continue;
    const [cikStr, companyName, formType, dateFiled, filename] = parts;
    if (formType !== "4" && formType !== "4/A") continue;
    const cik = Number(cikStr);
    if (!Number.isFinite(cik)) continue;
    const base = filename.trim().split("/").pop() ?? "";
    const accessionNo = base.replace(/\.txt$/i, "");
    if (!accessionNo) continue;
    const folder = accessionNo.replace(/-/g, "");
    out.push({
      cik,
      companyName: companyName.trim(),
      formType,
      dateFiled: dateFiled.trim(),
      accessionNo,
      submissionTxtUrl: `${SEC_BASE}/Archives/${filename.trim()}`,
      sourceUrl: `${SEC_BASE}/Archives/edgar/data/${cik}/${folder}/${accessionNo}-index.htm`,
    });
  }
  return out;
}

// ---- regex XML parser -------------------------------------------------------

function xmlGet(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(xml);
  if (!m) return null;
  const inner = m[1].trim();
  const vMatch = /^<value[^>]*>([\s\S]*?)<\/value>/i.exec(inner);
  const raw = (vMatch ? vMatch[1] : inner).replace(/<[^>]+>/g, "").trim();
  return raw || null;
}

function numGet(xml: string, tag: string): number | null {
  const s = xmlGet(xml, tag);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function boolGet(xml: string, tag: string): boolean | null {
  const s = xmlGet(xml, tag);
  if (!s) return null;
  if (s === "1" || s.toLowerCase() === "true") return true;
  if (s === "0" || s.toLowerCase() === "false") return false;
  return null;
}

function xmlBlocks(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi")) ?? [];
}

function parseTx(block: string, isDerivative: boolean, idx: number): TransactionRow {
  return {
    id: idx,
    security_title: xmlGet(block, "securityTitle"),
    is_derivative: isDerivative,
    transaction_date: xmlGet(block, "transactionDate"),
    transaction_code: xmlGet(block, "transactionCode"),
    shares: numGet(block, "transactionShares"),
    price_per_share: numGet(block, "transactionPricePerShare"),
    acquired_disposed: xmlGet(block, "transactionAcquiredDisposedCode"),
    shares_owned_after: numGet(block, "sharesOwnedFollowingTransaction"),
    ownership_type: xmlGet(block, "directOrIndirectOwnership"),
    footnote_ids: null,
    line_no: idx,
  };
}

function parseForm4Xml(xml: string) {
  let idx = 0;
  return {
    issuerCik: Number(xmlGet(xml, "issuerCik")) || null,
    issuerName: xmlGet(xml, "issuerName"),
    issuerTicker: xmlGet(xml, "issuerTradingSymbol"),
    insiderCik: Number(xmlGet(xml, "rptOwnerCik")) || null,
    insiderName: xmlGet(xml, "rptOwnerName"),
    insiderTitle: xmlGet(xml, "officerTitle"),
    isDirector: boolGet(xml, "isDirector"),
    isOfficer: boolGet(xml, "isOfficer"),
    isTenPct: boolGet(xml, "isTenPercentOwner"),
    periodOfReport: xmlGet(xml, "periodOfReport"),
    transactions: [
      ...xmlBlocks(xml, "nonDerivativeTransaction").map((b) => parseTx(b, false, idx++)),
      ...xmlBlocks(xml, "derivativeTransaction").map((b) => parseTx(b, true, idx++)),
    ] as TransactionRow[],
  };
}

async function fetchAndParse(entry: IndexEntry): Promise<FilingDetail> {
  const submission = await edgarGet(entry.submissionTxtUrl);
  const start = submission.indexOf("<XML>");
  const end = submission.indexOf("</XML>");
  if (start === -1 || end === -1) throw new Error("No <XML> block");
  const xml = submission.slice(start + 5, end).trim();
  const p = parseForm4Xml(xml);
  return {
    accession_no: entry.accessionNo,
    form_type: entry.formType,
    filing_date: entry.dateFiled,
    period_of_report: p.periodOfReport,
    insider_title: p.insiderTitle,
    is_director: p.isDirector,
    is_officer: p.isOfficer,
    is_ten_pct: p.isTenPct,
    source_url: entry.sourceUrl,
    raw_xml_url: entry.submissionTxtUrl,
    issuers: p.issuerCik
      ? { cik: p.issuerCik, name: p.issuerName ?? entry.companyName, ticker: p.issuerTicker }
      : { cik: entry.cik, name: entry.companyName, ticker: null },
    insiders: p.insiderCik ? { cik: p.insiderCik, name: p.insiderName ?? "Unknown" } : null,
    transactions: p.transactions,
  };
}

// ---- parallel batch fetch ---------------------------------------------------

async function fetchParallel(entries: IndexEntry[]): Promise<FilingDetail[]> {
  const results: FilingDetail[] = [];
  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const batch = entries.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(batch.map((e) => fetchAndParse(e)));
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
    }
    if (i + CONCURRENCY < entries.length) await sleep(BATCH_PAUSE_MS);
  }
  return results;
}

// ---- public queries ---------------------------------------------------------

export function getLatestFilings(limit = 200): Promise<FilingDetail[]> {
  return withCache(`latest:${limit}`, async () => {
    const today = new Date();
    let entries: IndexEntry[] = [];
    for (let i = 0; i < LOOKBACK_DAYS; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const e = await fetchDailyIndex(d);
      if (e.length) { entries = e; break; }
    }
    return fetchParallel(entries.slice(0, limit));
  });
}

export function searchFilings(q: string, limit = 30): Promise<FilingDetail[]> {
  const term = q.trim();
  if (!term) return Promise.resolve([]);
  return withCache(`search:${term}:${limit}`, async () => {
    const since = isoDate(new Date(Date.now() - 90 * 86400000));
    const today = isoDate(new Date());
    const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${term}"`)}&forms=4&dateRange=custom&startdt=${since}&enddt=${today}`;

    type Hit = { _source: { accession_no?: string } };
    let hits: Hit[] = [];
    try {
      const data = await edgarGetJson<{ hits: { hits: Hit[] } }>(url);
      hits = data?.hits?.hits ?? [];
    } catch { return []; }

    const entries: IndexEntry[] = hits.slice(0, limit).flatMap((h) => {
      const accNo = h._source.accession_no;
      if (!accNo) return [];
      const filerCik = parseInt(accNo.replace(/-/g, "").slice(0, 10), 10);
      if (!Number.isFinite(filerCik)) return [];
      const folder = accNo.replace(/-/g, "");
      return [{
        cik: filerCik, companyName: "", formType: "4",
        dateFiled: isoDate(new Date()), accessionNo: accNo,
        submissionTxtUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accNo}.txt`,
        sourceUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accNo}-index.htm`,
      }];
    });
    return fetchParallel(entries);
  });
}

export function getFilingsByIssuer(cik: number, limit = 40): Promise<FilingDetail[]> {
  return withCache(`issuer:${cik}:${limit}`, async () => {
    const padded = String(cik).padStart(10, "0");
    const atomUrl = `${SEC_BASE}/cgi-bin/browse-edgar?action=getcompany&CIK=${padded}&type=4&dateb=&owner=include&count=${limit}&output=atom`;
    let atomXml: string;
    try { atomXml = await edgarGet(atomUrl); } catch { return []; }

    const entries: IndexEntry[] = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/g;
    let em: RegExpExecArray | null;
    while ((em = entryRe.exec(atomXml)) !== null) {
      const block = em[1];
      const lm = /href="[^"]*\/Archives\/edgar\/data\/(\d+)\/(\d+)\/([^"]+)-index\.htm"/i.exec(block);
      if (!lm) continue;
      const filerCik = Number(lm[1]);
      const folder = lm[2];
      const accessionNo = lm[3];
      const dateMatch = /<updated>([^T<]+)/i.exec(block);
      const dateFiled = dateMatch ? dateMatch[1].trim() : isoDate(new Date());
      entries.push({
        cik: filerCik, companyName: "", formType: "4", dateFiled, accessionNo,
        submissionTxtUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accessionNo}.txt`,
        sourceUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accessionNo}-index.htm`,
      });
    }
    return fetchParallel(entries.slice(0, limit));
  });
}

export function getFilingsByInsider(cik: number, limit = 40): Promise<FilingDetail[]> {
  return withCache(`insider:${cik}:${limit}`, async () => {
    const padded = String(cik).padStart(10, "0");
    type Sub = { name?: string; filings?: { recent?: { accessionNumber?: string[]; form?: string[]; filingDate?: string[] } } };
    let data: Sub;
    try { data = await edgarGetJson<Sub>(`${DATA_BASE}/submissions/CIK${padded}.json`); }
    catch { return []; }

    const recent = data.filings?.recent;
    if (!recent) return [];
    const accessions = recent.accessionNumber ?? [];
    const forms = recent.form ?? [];
    const dates = recent.filingDate ?? [];

    const entries: IndexEntry[] = [];
    for (let i = 0; i < accessions.length && entries.length < limit; i++) {
      if (forms[i] !== "4" && forms[i] !== "4/A") continue;
      const accessionNo = accessions[i];
      const folder = accessionNo.replace(/-/g, "");
      entries.push({
        cik, companyName: data.name ?? "", formType: forms[i], dateFiled: dates[i] ?? "",
        accessionNo,
        submissionTxtUrl: `${SEC_BASE}/Archives/edgar/data/${cik}/${folder}/${accessionNo}.txt`,
        sourceUrl: `${SEC_BASE}/Archives/edgar/data/${cik}/${folder}/${accessionNo}-index.htm`,
      });
    }
    return fetchParallel(entries);
  });
}

export async function getFilingByAccession(accessionNo: string): Promise<FilingDetail | null> {
  const filerCik = parseInt(accessionNo.replace(/-/g, "").slice(0, 10), 10);
  if (!Number.isFinite(filerCik)) return null;
  const folder = accessionNo.replace(/-/g, "");
  try {
    return await fetchAndParse({
      cik: filerCik, companyName: "", formType: "4",
      dateFiled: isoDate(new Date()), accessionNo,
      submissionTxtUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accessionNo}.txt`,
      sourceUrl: `${SEC_BASE}/Archives/edgar/data/${filerCik}/${folder}/${accessionNo}-index.htm`,
    });
  } catch { return null; }
}
