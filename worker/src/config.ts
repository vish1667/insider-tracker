// Centralised config + env validation. Fails fast with a clear message
// if a required variable is missing, so the cron logs are easy to read.

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `Copy worker/.env.example to worker/.env and fill it in (or set repo secrets in CI).`
    );
  }
  return value.trim();
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  secUserAgent: required("SEC_USER_AGENT"),

  // EDGAR politeness settings. SEC asks for <= 10 req/sec; we stay well under.
  edgar: {
    baseUrl: "https://www.sec.gov",
    dataUrl: "https://data.sec.gov",
    minRequestSpacingMs: 150, // ~6-7 req/sec ceiling
    maxRetries: 4,
    backoffBaseMs: 800,
  },
} as const;
