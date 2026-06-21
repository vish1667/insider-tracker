import { Suspense } from "react";
import SearchBar from "./components/SearchBar";
import FilingsExplorer from "./components/FilingsExplorer";
import RefreshButton from "./components/RefreshButton";
import { getLatestFilings, searchFilings } from "@/lib/queries";
import { summarize } from "@/lib/summary";

// Always render fresh data (the worker updates the DB out of band).
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const filings = q ? await searchFilings(q) : await getLatestFilings(300);
  const summaries = filings.map(summarize);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{q ? `Results for “${q}”` : "Insider filings"}</h1>
          <p className="subtitle">
            {q
              ? `${filings.length} filing(s) matching ticker, company, or insider.`
              : "Latest Form 4 filings from SEC EDGAR — buys shown first."}
          </p>
        </div>
        <RefreshButton />
      </div>

      <Suspense>
        <SearchBar />
      </Suspense>

      <FilingsExplorer filings={summaries} />
    </>
  );
}
