import { NextRequest, NextResponse } from "next/server";
import { getOrgSettings, updateOrgSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getOrgSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const updated = await updateOrgSettings(body);
    return NextResponse.json({ ok: true, settings: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

