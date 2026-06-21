"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FilingSummary } from "@/lib/types";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

type Side = "all" | "buys" | "sells";
type Sort = "latest" | "value";

export default function FilingsExplorer({ filings }: { filings: FilingSummary[] }) {
  // Default to buys, latest first — the primary thing people watch for.
  const [side, setSide] = useState<Side>("buys");
  const [sort, setSort] = useState<Sort>("latest");
  const [text, setText] = useState("");

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    let out = filings.filter((f) => {
      if (side === "buys" && f.direction !== "A") return false;
      if (side === "sells" && f.direction !== "D") return false;
      if (q) {
        const hay = `${f.ticker ?? ""} ${f.company ?? ""} ${f.insider ?? ""} ${
          f.codeLabel
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    out = [...out].sort((a, b) => {
      if (sort === "value") return (b.value ?? -1) - (a.value ?? -1);
      // latest: filing_date desc, then value desc as a tiebreak
      if (a.filing_date !== b.filing_date) return a.filing_date < b.filing_date ? 1 : -1;
      return (b.value ?? -1) - (a.value ?? -1);
    });
    return out;
  }, [filings, side, sort, text]);

  const counts = useMemo(() => {
    let buys = 0;
    let sells = 0;
    for (const f of filings) {
      if (f.direction === "A") buys++;
      else if (f.direction === "D") sells++;
    }
    return { all: filings.length, buys, sells };
  }, [filings]);

  return (
    <div className="explorer">
      <div className="controls">
        <div className="segmented" role="tablist" aria-label="Filter by side">
          <button
            className={side === "all" ? "active" : ""}
            onClick={() => setSide("all")}
          >
            All <span className="count">{counts.all}</span>
          </button>
          <button
            className={side === "buys" ? "active buy" : "buy"}
            onClick={() => setSide("buys")}
          >
            Buys <span className="count">{counts.buys}</span>
          </button>
          <button
            className={side === "sells" ? "active sell" : "sell"}
            onClick={() => setSide("sells")}
          >
            Sells <span className="count">{counts.sells}</span>
          </button>
        </div>

        <input
          className="filter-input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Filter these rows by ticker, company, insider…"
          aria-label="Filter rows"
        />

        <label className="sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="latest">Latest</option>
            <option value="value">Biggest value</option>
          </select>
        </label>
      </div>

      <p className="result-count">
        Showing {rows.length} of {filings.length} filings
      </p>

      {rows.length === 0 ? (
        <div className="empty">No filings match this filter.</div>
      ) : (
        <div className="table-wrap big">
          <table>
            <thead>
              <tr>
                <th>Filed</th>
                <th>Type</th>
                <th>Ticker</th>
                <th>Company</th>
                <th>Insider</th>
                <th>Relationship</th>
                <th>Code</th>
                <th className="num">Shares</th>
                <th className="num">Price</th>
                <th className="num">Value</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.accession_no}>
                  <td>{fmtDate(f.filing_date)}</td>
                  <td>
                    {f.direction === "A" ? (
                      <span className="badge-side buy">Buy</span>
                    ) : f.direction === "D" ? (
                      <span className="badge-side sell">Sell</span>
                    ) : (
                      <span className="badge">—</span>
                    )}
                  </td>
                  <td>
                    {f.ticker && f.companyCik ? (
                      <Link href={`/company/${f.companyCik}`}>{f.ticker}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="company-cell">
                    {f.company && f.companyCik ? (
                      <Link href={`/company/${f.companyCik}`}>{f.company}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {f.insider && f.insiderCik ? (
                      <Link href={`/insider/${f.insiderCik}`}>{f.insider}</Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="rel-cell">{f.relationship}</td>
                  <td>{f.codeLabel}</td>
                  <td className="num">{fmtNumber(f.shares)}</td>
                  <td className="num">{fmtMoney(f.price)}</td>
                  <td className="num strong">{fmtMoney(f.value)}</td>
                  <td>
                    <Link href={`/filing/${f.accession_no}`}>Details →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
