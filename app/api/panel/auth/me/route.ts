import { NextRequest, NextResponse } from "next/server";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized || !auth.user) {
    return NextResponse.json(
      { ok: false, error: auth.error || "No autenticado" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
      phone: auth.user.phone,
    },
  });
}

