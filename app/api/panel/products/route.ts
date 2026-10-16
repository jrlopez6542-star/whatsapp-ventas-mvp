import { NextRequest, NextResponse } from "next/server";
import { getProducts, upsertProduct } from "@/lib/store";
import { requirePanelAuth } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requirePanelAuth(request);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "No autorizado" }, { status: 401 });
  }

  const products = await getProducts(false);
  return NextResponse.json({ ok: true, products });
}

export async function POST(request: NextRequest) {
  const auth = await requirePanelAuth(request, ["admin"]);
  if (!auth.authorized) {
    return NextResponse.json({ ok: false, error: auth.error || "Acceso denegado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    if (!body.sku || !body.name || body.price == null) {
      return NextResponse.json({ ok: false, error: "sku, name y price son requeridos" }, { status: 400 });
    }
    await upsertProduct({
      sku: String(body.sku).trim().toUpperCase(),
      name: String(body.name).trim(),
      price: Number(body.price),
      active: body.active !== false,
      description: body.description ? String(body.description).trim() : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
  }
}


