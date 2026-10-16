import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@/lib/store/dispatch";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "No autorizado" }, { status: 401 });
  }

  const store = await getStore();
  const conversations = await store.listConversations();
  return NextResponse.json({ ok: true, conversations });
}

