import { NextRequest, NextResponse } from "next/server";
import { getProduct, upsertProduct } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado" }, { status: 401 });
  }

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
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado" }, { status: 401 });
  }

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
