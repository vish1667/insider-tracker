-- ============================================================================
-- Stage 1 MVP schema: SEC Form 4 insider-trading tracker
-- Run this against your Supabase Postgres (SQL editor or `supabase db push`).
-- It is idempotent: safe to run more than once.
-- ============================================================================

-- Trigram extension powers fuzzy search on company / insider names.
create extension if not exists pg_trgm;

-- ----------------------------------------------------------------------------
-- issuers: companies whose securities are being traded
-- ----------------------------------------------------------------------------
create table if not exists issuers (
  cik         bigint primary key,           -- SEC Central Index Key (canonical id)
  name        text not null,
  ticker      text,                          -- may be null in Stage 1; filled in Stage 2
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- insiders: the reporting person/entity filing the Form 4
-- ----------------------------------------------------------------------------
create table if not exists insiders (
  cik         bigint primary key,            -- insiders also have CIKs
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- filings: one row per Form 4 document
-- ----------------------------------------------------------------------------
create table if not exists filings (
  id                bigserial primary key,
  accession_no      text unique not null,    -- GLOBAL dedupe key, e.g. 0001234567-25-000123
  form_type         text not null default '4',
  issuer_cik        bigint references issuers(cik),
  insider_cik       bigint references insiders(cik),
  filing_date       date not null,           -- date filed with SEC
  period_of_report  date,                    -- transaction reporting period
  insider_title     text,                    -- relationship text (Director, Officer, 10% owner...)
  is_director       boolean,
  is_officer        boolean,
  is_ten_pct        boolean,
  source_url        text not null,           -- link to original SEC filing index page
  raw_xml_url       text,                    -- direct link to the .xml document
  ingested_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- transactions: one row per transaction line inside a Form 4
-- (a single filing can contain several transaction lines)
-- ----------------------------------------------------------------------------
create table if not exists transactions (
  id                  bigserial primary key,
  filing_id           bigint not null references filings(id) on delete cascade,
  security_title      text,                  -- e.g. "Common Stock"
  is_derivative       boolean not null default false,
  transaction_date    date,
  transaction_code    text,                  -- P, S, A, M, G, F, etc.
  shares              numeric,
  price_per_share     numeric,
  acquired_disposed   char(1),               -- 'A' acquired / 'D' disposed
  shares_owned_after  numeric,
  ownership_type      text,                  -- 'D' direct / 'I' indirect
  footnote_ids        text,                  -- raw footnote refs, parsed later
  line_no             int not null,          -- order within the filing
  unique (filing_id, line_no)                -- dedupe transaction lines within a filing
);

-- ----------------------------------------------------------------------------
-- ingestion_runs: one row per worker run, for debugging + incremental cursors
-- ----------------------------------------------------------------------------
create table if not exists ingestion_runs (
  id            bigserial primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  target_date   date,                        -- which EDGAR day was processed
  filings_seen  int not null default 0,
  filings_new   int not null default 0,
  errors        int not null default 0,
  status        text not null default 'running',  -- running | success | failed
  notes         text
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists idx_filings_filing_date on filings (filing_date desc);
create index if not exists idx_filings_issuer      on filings (issuer_cik);
create index if not exists idx_filings_insider     on filings (insider_cik);
create index if not exists idx_issuers_ticker      on issuers (ticker);
create index if not exists idx_issuers_name_trgm   on issuers using gin (name gin_trgm_ops);
create index if not exists idx_insiders_name_trgm  on insiders using gin (name gin_trgm_ops);
create index if not exists idx_tx_filing           on transactions (filing_id);
create index if not exists idx_tx_code             on transactions (transaction_code);
