import { NextRequest, NextResponse } from "next/server";
import { runImapScan } from "@/lib/agreement-imap";

/**
 * User-triggered debug counterpart to the every-minute cron at
 * `/api/cron/check-agreement-replies`. The agreement page calls this
 * when the user clicks "Check for reply now" so they don't have to
 * wait for the next scheduled sweep.
 *
 * Auth modes:
 *
 *   1. {@code Authorization: Bearer <CRON_SECRET>}
 *      Admin/cron path. Sweeps every unread message; same scope as
 *      the scheduled cron.
 *
 *   2. {@code Authorization: Bearer <user JWT>}
 *      User path. We re-validate the token against the Spring
 *      backend's `/api/users/profile` endpoint, then narrow the IMAP
 *      scan to messages from that user's address. This avoids
 *      surfacing other users' inbox traffic in the debug response.
 *
 * Returns the same shape as the cron, plus a verbose `logs` array
 * the frontend pipes into its on-page status log panel.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) {
    return NextResponse.json(
      { ok: false, error: "Authorization header required", logs: [] },
      { status: 401 },
    );
  }

  const token = auth.slice(7).trim();
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "Empty bearer token", logs: [] },
      { status: 401 },
    );
  }

  // Cron-secret short-circuit — admins and the cron itself both
  // get the unfiltered sweep.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) {
    const result = await runImapScan({ scopeEmail: null, collectLogs: true });
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Otherwise treat the token as a user JWT. Resolve it via the
  // backend so we don't have to share the JWT signing key with the
  // Vercel runtime; the profile endpoint is exempt from the
  // agreement gate, so this works even mid-flow.
  const backendBase =
    process.env.NEXT_PUBLIC_API_URL
    || "https://spireinfotech-production.up.railway.app";
  let userEmail: string | null = null;
  try {
    const profile = await fetch(`${backendBase}/api/users/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profile.ok) {
      return NextResponse.json(
        { ok: false, error: `Profile lookup failed (${profile.status})`, logs: [] },
        { status: 401 },
      );
    }
    const json = await profile.json();
    userEmail = json?.data?.email ?? json?.email ?? null;
    if (!userEmail) {
      return NextResponse.json(
        { ok: false, error: "Profile did not include email", logs: [] },
        { status: 500 },
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Profile lookup error";
    return NextResponse.json(
      { ok: false, error: msg, logs: [] },
      { status: 500 },
    );
  }

  const result = await runImapScan({
    scopeEmail: userEmail,
    collectLogs: true,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
