import { NextRequest, NextResponse } from "next/server";
import { deleteOrder } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteOrder(id);
  return NextResponse.json({ ok: true });
}
