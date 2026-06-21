// Parses a Form 4 ownership document into normalized rows.
//
// Form 4 filings are submitted as a single .txt "full submission" with the
// machine-readable XML embedded between <XML> ... </XML> tags. We extract that
// block and parse it. Every field is treated as OPTIONAL — real filings omit
// fields, use footnotes, or vary slightly — so the parser never throws on a
// missing node; it returns nulls and lets the caller decide.

import { XMLParser } from "fast-xml-parser";
import { edgarFetch } from "./client.js";
import type { Form4IndexEntry } from "./index-fetcher.js";

export interface ParsedTransaction {
  securityTitle: string | null;
  isDerivative: boolean;
  transactionDate: string | null;
  transactionCode: string | null;
  shares: number | null;
  pricePerShare: number | null;
  acquiredDisposed: string | null; // 'A' | 'D'
  sharesOwnedAfter: number | null;
  ownershipType: string | null; // 'D' | 'I'
  footnoteIds: string | null;
}

export interface ParsedForm4 {
  issuerCik: number | null;
  issuerName: string | null;
  issuerTicker: string | null;
  insiderCik: number | null;
  insiderName: string | null;
  insiderTitle: string | null;
  isDirector: boolean | null;
  isOfficer: boolean | null;
  isTenPct: boolean | null;
  periodOfReport: string | null;
  transactions: ParsedTransaction[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false, // keep raw strings; we coerce numbers ourselves
  trimValues: true,
});

// ---- small, defensive accessors -------------------------------------------

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Unwrap SEC's `<tag><value>X</value></tag>` shape, or a bare scalar. */
function val(node: unknown): string | null {
  if (node == null) return null;
  if (typeof node === "object" && "value" in (node as Record<string, unknown>)) {
    const v = (node as Record<string, unknown>).value;
    return v == null ? null : String(v).trim();
  }
  if (typeof node === "object") return null;
  const s = String(node).trim();
  return s === "" ? null : s;
}

function num(node: unknown): number | null {
  const s = val(node);
  if (s == null) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intCik(node: unknown): number | null {
  const s = typeof node === "object" ? val(node) : node == null ? null : String(node);
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function bool01(node: unknown): boolean | null {
  const s = val(node);
  if (s == null) return null;
  if (s === "1" || s.toLowerCase() === "true") return true;
  if (s === "0" || s.toLowerCase() === "false") return false;
  return null;
}

/** Collect footnoteId references on a transaction node into a CSV string. */
function footnotes(node: Record<string, unknown>): string | null {
  const ids = new Set<string>();
  const walk = (o: unknown) => {
    if (o == null || typeof o !== "object") return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (k === "footnoteId") {
        for (const f of toArray(v)) {
          const id = (f as Record<string, unknown>)?.["@_id"];
          if (id) ids.add(String(id));
        }
      } else if (typeof v === "object") {
        walk(v);
      }
    }
  };
  walk(node);
  return ids.size ? [...ids].join(",") : null;
}

// ---- XML extraction --------------------------------------------------------

/** Pull the first <XML>...</XML> block out of a full submission .txt. */
export function extractXmlBlock(submission: string): string | null {
  const start = submission.indexOf("<XML>");
  const end = submission.indexOf("</XML>");
  if (start === -1 || end === -1 || end <= start) return null;
  return submission.slice(start + "<XML>".length, end).trim();
}

function mapTransaction(node: Record<string, unknown>, isDerivative: boolean): ParsedTransaction {
  const coding = (node.transactionCoding ?? {}) as Record<string, unknown>;
  const amounts = (node.transactionAmounts ?? {}) as Record<string, unknown>;
  const post = (node.postTransactionAmounts ?? {}) as Record<string, unknown>;
  const nature = (node.ownershipNature ?? {}) as Record<string, unknown>;

  return {
    securityTitle: val(node.securityTitle),
    isDerivative,
    transactionDate: val(node.transactionDate),
    transactionCode: val(coding.transactionCode),
    shares: num(amounts.transactionShares),
    pricePerShare: num(amounts.transactionPricePerShare),
    acquiredDisposed: val(amounts.transactionAcquiredDisposedCode),
    sharesOwnedAfter: num(post.sharesOwnedFollowingTransaction),
    ownershipType: val(nature.directOrIndirectOwnership),
    footnoteIds: footnotes(node),
  };
}

/** Parse an extracted ownershipDocument XML string. */
export function parseForm4Xml(xml: string): ParsedForm4 {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = (doc.ownershipDocument ?? {}) as Record<string, unknown>;

  const issuer = (root.issuer ?? {}) as Record<string, unknown>;

  // A filing may list multiple reporting owners; for the MVP we take the first.
  const owner = (toArray(root.reportingOwner)[0] ?? {}) as Record<string, unknown>;
  const ownerId = (owner.reportingOwnerId ?? {}) as Record<string, unknown>;
  const rel = (owner.reportingOwnerRelationship ?? {}) as Record<string, unknown>;

  const nonDeriv = (root.nonDerivativeTable ?? {}) as Record<string, unknown>;
  const deriv = (root.derivativeTable ?? {}) as Record<string, unknown>;

  const transactions: ParsedTransaction[] = [
    ...toArray(nonDeriv.nonDerivativeTransaction as Record<string, unknown>[]).map((t) =>
      mapTransaction(t, false)
    ),
    ...toArray(deriv.derivativeTransaction as Record<string, unknown>[]).map((t) =>
      mapTransaction(t, true)
    ),
  ];

  return {
    issuerCik: intCik(issuer.issuerCik),
    issuerName: val(issuer.issuerName),
    issuerTicker: val(issuer.issuerTradingSymbol),
    insiderCik: intCik(ownerId.rptOwnerCik),
    insiderName: val(ownerId.rptOwnerName),
    insiderTitle: val(rel.officerTitle),
    isDirector: bool01(rel.isDirector),
    isOfficer: bool01(rel.isOfficer),
    isTenPct: bool01(rel.isTenPercentOwner),
    periodOfReport: val(root.periodOfReport),
    transactions,
  };
}

/** Download a filing's submission .txt and parse the Form 4 inside it. */
export async function fetchAndParseForm4(entry: Form4IndexEntry): Promise<ParsedForm4> {
  const submission = await edgarFetch<string>(entry.submissionTxtUrl);
  const xml = extractXmlBlock(submission);
  if (!xml) {
    throw new Error(`No <XML> ownership block found in ${entry.submissionTxtUrl}`);
  }
  return parseForm4Xml(xml);
}
