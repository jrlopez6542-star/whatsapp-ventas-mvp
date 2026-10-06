import { NextRequest, NextResponse } from "next/server";
import { getProduct, upsertProduct } from "@/lib/store";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) {
    return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const updated = {
      ...product,
      name: body.name != null ? String(body.name).trim() : product.name,
      price: body.price != null ? Number(body.price) : product.price,
      active: body.active != null ? Boolean(body.active) : product.active,
      description: body.description != null ? String(body.description).trim() : product.description,
    };
    await upsertProduct(updated);
    return NextResponse.json({ ok: true, product: updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const product = await getProduct(sku);
  if (!product) {
    return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
  }

  // Soft delete (desactivar)
  await upsertProduct({
    ...product,
    active: false,
  });

  return NextResponse.json({ ok: true });
}
