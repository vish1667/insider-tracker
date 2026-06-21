import { Suspense } from "react";
import SearchBar from "./components/SearchBar";
import FilingsTable from "./components/FilingsTable";
import { getLatestFilings, searchFilings } from "@/lib/queries";

// Always render fresh data (the worker updates the DB out of band).
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = searchParams.q?.trim() ?? "";
  const filings = q ? await searchFilings(q) : await getLatestFilings(50);

  return (
    <>
      <h1>{q ? `Results for “${q}”` : "Latest insider filings"}</h1>
      <p className="subtitle">
        {q
          ? `${filings.length} filing(s) matching ticker, company, or insider.`
          : "Most recent Form 4 filings ingested from SEC EDGAR."}
      </p>

      <Suspense>
        <SearchBar />
      </Suspense>

      <FilingsTable filings={filings} />
    </>
  );
}
