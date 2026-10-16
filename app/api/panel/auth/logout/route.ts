import { NextRequest, NextResponse } from "next/server";
import { revokeSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("panel_session")?.value;
  if (token) {
    await revokeSession(token).catch(() => {});
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("panel_session");
  return response;
}
