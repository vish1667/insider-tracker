// Triggers a fresh ingestion pass: runs the worker against SEC EDGAR for the
// latest day and reports how many new filings were added. The worker dedupes
// against the DB, so re-running is cheap (only genuinely new filings are
// fetched). Used by the "Refresh from SEC EDGAR" button on the dashboard.
//
// NOTE: this spawns the local worker process, so it works in local/dev or any
// long-running Node host. It will NOT work on serverless (e.g. Vercel), where
// the worker files aren't present and the function would time out — in that
// environment the GitHub Actions cron is the refresh path instead.

import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  const workerDir = path.join(process.cwd(), "..", "worker");
  const tsx = path.join(workerDir, "node_modules", ".bin", "tsx");

  return new Promise<Response>((resolve) => {
    const child = spawn(tsx, ["--env-file=.env", "src/index.ts", "--days", "1"], {
      cwd: workerDir,
    });

    let combined = "";
    child.stdout.on("data", (d) => (combined += d.toString()));
    child.stderr.on("data", (d) => (combined += d.toString()));

    child.on("error", (e) => {
      resolve(NextResponse.json({ ok: false, error: e.message }, { status: 500 }));
    });

    child.on("close", (code) => {
      // The worker's final "Ingestion complete" log line carries "new":N.
      let added = 0;
      const matches = combined.match(/"new":(\d+)/g);
      if (matches?.length) {
        const n = matches[matches.length - 1].match(/\d+/);
        if (n) added = Number(n[0]);
      }
      if (code === 0) {
        resolve(NextResponse.json({ ok: true, new: added }));
      } else {
        const tail = combined.trim().split("\n").slice(-3).join(" ");
        resolve(
          NextResponse.json(
            { ok: false, error: tail || `worker exited with code ${code}` },
            { status: 500 }
          )
        );
      }
    });
  });
}
