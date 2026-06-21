// Worker entrypoint.
//
// Usage:
//   npm run ingest             -> ingest today only (1 day)
//   npm run ingest:days 7      -> ingest the last 7 calendar days (backfill)
//   tsx src/index.ts --days 30 -> same, explicit flag
//
// Loads worker/.env locally (Node 24 supports --env-file, but we parse a
// minimal .env here so `npm run` works without extra flags).

import { readFileSync } from "node:fs";
import { runIngestion } from "./ingest/run.js";
import { log } from "./util/log.js";

// --- minimal .env loader (no dependency) -----------------------------------
function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // No .env file (e.g. in CI where vars come from secrets) — that's fine.
  }
}

function parseDays(argv: string[]): number {
  const idx = argv.indexOf("--days");
  let raw: string | undefined;
  if (idx !== -1) raw = argv[idx + 1];
  else raw = argv.find((a) => /^\d+$/.test(a)); // allow bare number via npm run ingest:days 7
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

async function main() {
  loadDotEnv();
  const days = parseDays(process.argv.slice(2));
  log.info("Worker starting", { days });
  await runIngestion(days);
}

main().catch((err) => {
  log.error("Worker failed", { error: (err as Error).message });
  process.exit(1);
});
