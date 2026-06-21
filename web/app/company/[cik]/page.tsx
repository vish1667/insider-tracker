import Link from "next/link";
import { notFound } from "next/navigation";
import FilingsTable from "@/app/components/FilingsTable";
import { getFilingsByIssuer } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: { cik: string } }) {
  const cik = Number(params.cik);
  if (!Number.isFinite(cik)) notFound();

  const filings = await getFilingsByIssuer(cik);
  const issuer = filings[0]?.issuers;

  return (
    <>
      <Link href="/" className="back">
        ← Back to filings
      </Link>
      <h1>
        {issuer?.name ?? `CIK ${cik}`}{" "}
        {issuer?.ticker ? <span className="badge">{issuer.ticker}</span> : null}
      </h1>
      <p className="subtitle">{filings.length} insider filing(s) for this company.</p>
      <FilingsTable filings={filings} />
    </>
  );
}
