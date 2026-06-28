import { NextResponse } from "next/server";
import { invalidateCache } from "@/lib/edgar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    invalidateCache();
    return NextResponse.json({ ok: true, new: 1, remaining: 0 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
