import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token =
    request.cookies.get("panel_session")?.value ||
    request.cookies.get("crm_session")?.value;

  if (token) {
    try {
      await revokeSession(token);
    } catch (err) {
      console.error("[auth] logout revokeSession error:", err);
    }
  }

  const response = NextResponse.json({ ok: true });

  const expireCookieOptions = {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    expires: new Date(0),
  };

  response.cookies.set("panel_session", "", expireCookieOptions);
  response.cookies.set("crm_session", "", expireCookieOptions);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");

  return response;
}
