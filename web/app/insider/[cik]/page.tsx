import Link from "next/link";
import { notFound } from "next/navigation";
import FilingsTable from "@/app/components/FilingsTable";
import { getFilingsByInsider } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function InsiderPage({ params }: { params: { cik: string } }) {
  const cik = Number(params.cik);
  if (!Number.isFinite(cik)) notFound();

  const filings = await getFilingsByInsider(cik);
  const insider = filings[0]?.insiders;

  return (
    <>
      <Link href="/" className="back">
        ← Back to filings
      </Link>
      <h1>{insider?.name ?? `CIK ${cik}`}</h1>
      <p className="subtitle">{filings.length} filing(s) by this insider.</p>
      <FilingsTable filings={filings} />
    </>
  );
}
