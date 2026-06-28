import { Suspense } from "react";
import SearchBar from "./components/SearchBar";
import FilingsExplorer from "./components/FilingsExplorer";
import RefreshButton from "./components/RefreshButton";
import StatCards from "./components/StatCards";
import ClusterBuys from "./components/ClusterBuys";
import { getLatestFilings, searchFilings } from "@/lib/queries";
import { summarize } from "@/lib/summary";
import { computeStats, computeClusterBuys } from "@/lib/stats";

export const dynamic = "force-dynamic";

async function FilingsSection({ q }: { q: string }) {
  const filings = q ? await searchFilings(q) : await getLatestFilings(200);
  const summaries = filings.map(summarize);
  const stats = computeStats(summaries);
  const clusters = q ? [] : computeClusterBuys(summaries);

  return (
    <>
      <p className="subtitle" style={{ marginBottom: "1rem" }}>
        {q
          ? `${filings.length} filing(s) matching ticker, company, or insider.`
          : `${filings.length} Form 4 filings loaded from SEC EDGAR.`}
      </p>
      <StatCards stats={stats} />
      {!q && <ClusterBuys clusters={clusters} />}
      <FilingsExplorer filings={summaries} />
    </>
  );
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim() ?? "";

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{q ? `Results for "${q}"` : "Insider filings"}</h1>
        </div>
        <RefreshButton />
      </div>

      <Suspense>
        <SearchBar />
      </Suspense>

      <Suspense
        fallback={
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--muted)" }}>
            Fetching filings from SEC EDGAR…
          </div>
        }
      >
        <FilingsSection q={q} />
      </Suspense>
    </>
  );
}
