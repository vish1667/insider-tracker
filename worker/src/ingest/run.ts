// Orchestrates one ingestion pass over a range of days.
//
// For each day:
//   1. Fetch the Form 4 daily index.
//   2. Dedupe against the DB by accession_no (skip already-stored filings).
//   3. Download + parse each new filing.
//   4. Save it (issuer, insider, filing, transactions).
// A single bad filing is logged and counted, but never aborts the batch.

import { fetchForm4Index } from "../edgar/index-fetcher.js";
import { fetchAndParseForm4 } from "../edgar/form4-parser.js";
import { findExistingAccessions, saveFiling, startRun, finishRun } from "../db/supabase.js";
import { log } from "../util/log.js";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Process a single calendar day. Returns counters for the run log. */
async function ingestDay(date: Date): Promise<{ seen: number; created: number; errors: number }> {
  const entries = await fetchForm4Index(date);
  if (entries.length === 0) return { seen: 0, created: 0, errors: 0 };

  // Dedupe: ask the DB which accessions we already have, process only the rest.
  const existing = await findExistingAccessions(entries.map((e) => e.accessionNo));
  const fresh = entries.filter((e) => !existing.has(e.accessionNo));

  log.info("Day dedupe complete", {
    date: isoDate(date),
    seen: entries.length,
    already: existing.size,
    toProcess: fresh.length,
  });

  let created = 0;
  let errors = 0;

  for (const entry of fresh) {
    try {
      const parsed = await fetchAndParseForm4(entry);
      await saveFiling(entry, parsed);
      created++;
    } catch (err) {
      errors++;
      log.error("Failed to ingest filing (skipping)", {
        accession: entry.accessionNo,
        url: entry.submissionTxtUrl,
        error: (err as Error).message,
      });
    }
  }

  return { seen: entries.length, created, errors };
}

/**
 * Ingest `days` calendar days ending today (UTC). days=1 → just today.
 * Weekends/holidays simply yield empty indexes and are skipped.
 */
export async function runIngestion(days: number): Promise<void> {
  const today = new Date();
  const targetDateStr = isoDate(today);
  const runId = await startRun(targetDateStr);

  let totalSeen = 0;
  let totalNew = 0;
  let totalErrors = 0;

  try {
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - i);
      const { seen, created, errors } = await ingestDay(d);
      totalSeen += seen;
      totalNew += created;
      totalErrors += errors;
    }

    await finishRun(runId, {
      filings_seen: totalSeen,
      filings_new: totalNew,
      errors: totalErrors,
      status: "success",
      notes: `Ingested ${days} day(s).`,
    });

    log.info("Ingestion complete", {
      days,
      seen: totalSeen,
      new: totalNew,
      errors: totalErrors,
    });
  } catch (err) {
    await finishRun(runId, {
      filings_seen: totalSeen,
      filings_new: totalNew,
      errors: totalErrors + 1,
      status: "failed",
      notes: (err as Error).message,
    });
    throw err;
  }
}
