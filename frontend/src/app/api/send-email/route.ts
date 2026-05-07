import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

/**
 * Email relay — Vercel Node runtime → Gmail SMTP via Nodemailer.
 *
 * Why this exists: Railway blocks outbound SMTP on every port, so
 * the Spring Boot backend can't talk to Gmail directly. Vercel's
 * serverless Node runtime can, so we route every send through this
 * endpoint. The backend POSTs JSON here; we authenticate via a
 * shared secret and hand the message off to Nodemailer.
 *
 * Request:
 *   POST /api/send-email
 *   Body: { to, subject, html, secret }
 * Response:
 *   { ok: true,  message, messageId }   — 200
 *   { ok: false, message }              — 4xx/5xx
 *
 * The secret is a symmetric token shared between the Spring backend
 * and this route. Anyone who reads it can spam the relay; that's
 * acceptable while this endpoint is internal-use only and the test
 * widget on the homepage has a TODO to ship without it.
 */

// Force the Node runtime — Nodemailer is not edge-compatible (uses
// `net` for the raw SMTP socket).
export const runtime = "nodejs";

interface SendEmailBody {
  to?: string;
  subject?: string;
  html?: string;
  secret?: string;
}

export async function POST(req: NextRequest) {
  let body: SendEmailBody;
  try {
    body = (await req.json()) as SendEmailBody;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const { to, subject, html, secret } = body;

  // Auth gate — rejected before any validation so a probe can't
  // distinguish "missing field" vs "wrong secret".
  if (!process.env.EMAIL_RELAY_SECRET || secret !== process.env.EMAIL_RELAY_SECRET) {
    return NextResponse.json(
      { ok: false, message: "Unauthorized" },
      { status: 403 },
    );
  }

  if (!to || !subject || !html) {
    return NextResponse.json(
      { ok: false, message: "Missing required fields: to, subject, html" },
      { status: 400 },
    );
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    console.error("[SMTP] Missing configuration");
    return NextResponse.json(
      { ok: false, message: "SMTP not configured on Vercel" },
      { status: 500 },
    );
  }

  console.log("[SMTP] Sending email:", { to, subject });

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT || 465),
      // SMTPS by default. Set SMTP_SECURE=false to fall back to
      // STARTTLS on 587 if a downstream provider needs it.
      secure: process.env.SMTP_SECURE !== "false",
      auth: { user, pass },
    });

    // Display name hardcoded in code rather than read from env so an
    // SMTP_FROM that's just a bare address (or one with stray quotes)
    // can't make Gmail render the "From" as the local-part of the
    // mailbox. The name + address quoting follows RFC 5322.
    const result = await transporter.sendMail({
      from: `"Spire Info Tech" <${user}>`,
      to,
      subject,
      html,
    });

    console.log("[SMTP] Email sent:", result.messageId);

    return NextResponse.json({
      ok: true,
      message: `Email sent to ${to}`,
      messageId: result.messageId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[SMTP] Send failed:", message);
    return NextResponse.json(
      { ok: false, message },
      { status: 500 },
    );
  }
}
