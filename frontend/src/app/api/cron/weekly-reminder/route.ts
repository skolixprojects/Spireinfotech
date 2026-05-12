import { NextResponse } from "next/server";

/**
 * Vercel cron: hits the backend's /api/internal/weekly-reminder
 * endpoint every Monday at 03:30 UTC (≈ 09:00 IST). The backend
 * already has its own @Scheduled trigger as a belt-and-suspenders;
 * this route exists so the schedule is visible in vercel.json
 * alongside any other cron jobs, and so we have an external poke
 * if the Railway worker is asleep.
 *
 * Auth: Vercel cron passes `Authorization: Bearer ${CRON_SECRET}`
 * automatically. We re-emit that as `X-Cron-Secret` for the backend.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  // Vercel-emitted bearer — refuse anything else so this route
  // can't be triggered by random GETs from the open internet.
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const backendUrl = process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  if (!backendUrl) {
    return NextResponse.json(
      { ok: false, message: "BACKEND_URL not configured" },
      { status: 500 },
    );
  }

  try {
    const upstream = await fetch(`${backendUrl}/api/internal/weekly-reminder`, {
      method: "POST",
      headers: {
        "X-Cron-Secret": expected,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const text = await upstream.text();
    return new NextResponse(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err instanceof Error ? err.message : "Upstream failed" },
      { status: 502 },
    );
  }
}
