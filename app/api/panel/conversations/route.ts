import { NextResponse } from "next/server";
import { getStore } from "@/lib/store/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const store = await getStore();
  const conversations = await store.listConversations();
  return NextResponse.json({ ok: true, conversations });
}

