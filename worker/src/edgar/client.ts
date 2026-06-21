// Polite HTTP client for SEC EDGAR.
//
// SEC rules we honour:
//  - Send a descriptive User-Agent identifying the requester (name + email).
//  - Stay well under 10 requests/second (we serialise + space requests).
//  - Back off on 429 (rate limited) and 5xx (transient) responses.
//
// All EDGAR access in the worker goes through this single client so the
// rate limit is enforced globally, not per-call.

import { config } from "../config.js";
import { log } from "../util/log.js";

let lastRequestAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serialise requests so two fetches never fire closer than minRequestSpacingMs.
async function throttle(): Promise<void> {
  const now = Date.now();
  const wait = config.edgar.minRequestSpacingMs - (now - lastRequestAt);
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

export interface FetchOptions {
  /** "text" (default) for index/XML docs, or "json" for data.sec.gov APIs. */
  as?: "text" | "json";
}

/**
 * Fetch a URL from EDGAR with throttling + exponential backoff.
 * Throws after maxRetries on persistent failure.
 */
export async function edgarFetch<T = string>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const { as = "text" } = options;

  for (let attempt = 0; attempt <= config.edgar.maxRetries; attempt++) {
    await throttle();

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": config.secUserAgent,
          "Accept-Encoding": "gzip, deflate",
          Host: new URL(url).host,
        },
      });

      // Retry on rate-limit / transient server errors.
      if (res.status === 429 || res.status >= 500) {
        const backoff = config.edgar.backoffBaseMs * Math.pow(2, attempt);
        log.warn("EDGAR transient status, backing off", {
          url,
          status: res.status,
          attempt,
          backoffMs: backoff,
        });
        await sleep(backoff);
        continue;
      }

      if (!res.ok) {
        throw new Error(`EDGAR request failed: ${res.status} ${res.statusText} for ${url}`);
      }

      return (as === "json" ? await res.json() : await res.text()) as T;
    } catch (err) {
      // Network-level error (DNS, reset, etc.) — also worth retrying.
      if (attempt === config.edgar.maxRetries) throw err;
      const backoff = config.edgar.backoffBaseMs * Math.pow(2, attempt);
      log.warn("EDGAR fetch error, backing off", {
        url,
        attempt,
        backoffMs: backoff,
        error: (err as Error).message,
      });
      await sleep(backoff);
    }
  }

  throw new Error(`EDGAR request exhausted retries for ${url}`);
}
