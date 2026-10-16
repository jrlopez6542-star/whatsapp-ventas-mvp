import { NextRequest, NextResponse } from "next/server";
import { getOrgSettings, updateOrgSettings } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "No autorizado" }, { status: 401 });
  }

  const settings = await getOrgSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(request: NextRequest) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json(
      { ok: false, error: "Acceso denegado. Solo administradores pueden modificar la configuración del sistema." },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const updated = await updateOrgSettings(body);
    return NextResponse.json({ ok: true, settings: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  return PUT(request);
}
