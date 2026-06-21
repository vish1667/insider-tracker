// Shared row shapes for the views. Kept loose on purpose — fields can be null
// because SEC filings frequently omit data.

export interface IssuerRef {
  cik: number;
  name: string;
  ticker: string | null;
}

export interface InsiderRef {
  cik: number;
  name: string;
}

export interface FilingRow {
  accession_no: string;
  form_type: string;
  filing_date: string;
  period_of_report: string | null;
  insider_title: string | null;
  is_director: boolean | null;
  is_officer: boolean | null;
  is_ten_pct: boolean | null;
  source_url: string;
  raw_xml_url: string | null;
  issuers: IssuerRef | null;
  insiders: InsiderRef | null;
}

export interface TransactionRow {
  id: number;
  security_title: string | null;
  is_derivative: boolean;
  transaction_date: string | null;
  transaction_code: string | null;
  shares: number | null;
  price_per_share: number | null;
  acquired_disposed: string | null;
  shares_owned_after: number | null;
  ownership_type: string | null;
  footnote_ids: string | null;
  line_no: number;
}

export interface FilingDetail extends FilingRow {
  transactions: TransactionRow[];
}
