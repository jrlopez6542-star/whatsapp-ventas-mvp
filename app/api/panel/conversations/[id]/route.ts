import { NextRequest, NextResponse } from "next/server";
import { deleteConversation } from "@/lib/store";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);
  try {
    await deleteConversation(decodedId);
    return NextResponse.json({ ok: true, deletedId: decodedId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
