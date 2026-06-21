import Link from "next/link";
import { notFound } from "next/navigation";
import { getFilingByAccession } from "@/lib/queries";
import {
  fmtDate,
  fmtMoney,
  fmtNumber,
  txCodeLabel,
  relationship,
  acquiredColor,
} from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function FilingDetailPage({
  params,
}: {
  params: { accession: string };
}) {
  const accession = decodeURIComponent(params.accession);
  const filing = await getFilingByAccession(accession);
  if (!filing) notFound();

  return (
    <>
      <Link href="/" className="back">
        ← Back to filings
      </Link>

      <h1>
        {filing.issuers?.name ?? "Unknown issuer"}{" "}
        {filing.issuers?.ticker ? <span className="badge">{filing.issuers.ticker}</span> : null}
      </h1>
      <p className="subtitle">
        Form {filing.form_type} · filed {fmtDate(filing.filing_date)}
      </p>

      <dl className="detail-grid">
        <dt>Insider</dt>
        <dd>
          {filing.insiders ? (
            <Link href={`/insider/${filing.insiders.cik}`}>{filing.insiders.name}</Link>
          ) : (
            "—"
          )}
        </dd>
        <dt>Relationship</dt>
        <dd>
          {relationship(
            filing.is_director,
            filing.is_officer,
            filing.is_ten_pct,
            filing.insider_title
          )}
        </dd>
        <dt>Period of report</dt>
        <dd>{fmtDate(filing.period_of_report)}</dd>
        <dt>Accession</dt>
        <dd>{filing.accession_no}</dd>
      </dl>

      <div className="source-links">
        <a href={filing.source_url} target="_blank" rel="noopener noreferrer">
          View original filing on SEC →
        </a>
        {filing.raw_xml_url ? (
          <a href={filing.raw_xml_url} target="_blank" rel="noopener noreferrer">
            Raw submission →
          </a>
        ) : null}
      </div>

      <h2>Transactions</h2>
      {filing.transactions.length === 0 ? (
        <div className="empty">No transaction lines parsed for this filing.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Security</th>
                <th>Type</th>
                <th>Code</th>
                <th>A/D</th>
                <th className="num">Shares</th>
                <th className="num">Price</th>
                <th className="num">Owned after</th>
                <th>Ownership</th>
              </tr>
            </thead>
            <tbody>
              {filing.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{fmtDate(t.transaction_date)}</td>
                  <td>{t.security_title ?? "—"}</td>
                  <td>{t.is_derivative ? "Derivative" : "Non-derivative"}</td>
                  <td>{txCodeLabel(t.transaction_code)}</td>
                  <td style={{ color: acquiredColor(t.acquired_disposed), fontWeight: 600 }}>
                    {t.acquired_disposed ?? "—"}
                  </td>
                  <td className="num">{fmtNumber(t.shares)}</td>
                  <td className="num">{fmtMoney(t.price_per_share)}</td>
                  <td className="num">{fmtNumber(t.shares_owned_after)}</td>
                  <td>{t.ownership_type === "I" ? "Indirect" : t.ownership_type === "D" ? "Direct" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
