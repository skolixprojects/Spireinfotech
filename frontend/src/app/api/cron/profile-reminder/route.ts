import { NextResponse } from "next/server";

/**
 * Vercel cron: hits the backend's /api/internal/profile-reminder
 * endpoint every day at 04:00 UTC (≈ 09:30 IST). The backend has
 * its own @Scheduled trigger as a belt-and-suspenders; this route
 * exists so the schedule is visible in vercel.json and so the cron
 * still fires if the Railway worker sleeps between calls.
 *
 * Auth: Vercel cron passes `Authorization: Bearer ${CRON_SECRET}`
 * automatically. We re-emit that as `X-Cron-Secret` for the backend.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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
    const upstream = await fetch(`${backendUrl}/api/internal/profile-reminder`, {
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
