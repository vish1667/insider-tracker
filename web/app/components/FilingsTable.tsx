import Link from "next/link";
import type { FilingRow } from "@/lib/types";
import { fmtDate, relationship } from "@/lib/format";

export default function FilingsTable({ filings }: { filings: FilingRow[] }) {
  if (filings.length === 0) {
    return <div className="empty">No filings found.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Filed</th>
            <th>Ticker</th>
            <th>Company</th>
            <th>Insider</th>
            <th>Relationship</th>
            <th>Form</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filings.map((f) => (
            <tr key={f.accession_no}>
              <td>{fmtDate(f.filing_date)}</td>
              <td>
                {f.issuers?.ticker ? (
                  <Link href={`/company/${f.issuers.cik}`}>{f.issuers.ticker}</Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {f.issuers ? (
                  <Link href={`/company/${f.issuers.cik}`}>{f.issuers.name}</Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {f.insiders ? (
                  <Link href={`/insider/${f.insiders.cik}`}>{f.insiders.name}</Link>
                ) : (
                  "—"
                )}
              </td>
              <td>
                {relationship(f.is_director, f.is_officer, f.is_ten_pct, f.insider_title)}
              </td>
              <td>
                <span className="badge">{f.form_type}</span>
              </td>
              <td>
                <Link href={`/filing/${f.accession_no}`}>Details →</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
