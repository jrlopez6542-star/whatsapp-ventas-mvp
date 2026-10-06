import { NextResponse } from "next/server";
import { getProducts } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const products = await getProducts(true);
    return NextResponse.json(
      {
        ok: true,
        currency: "COP",
        products,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[catalog] Error fetching products", error);
    return NextResponse.json(
      { ok: false, error: "Error al obtener catálogo" },
      { status: 500 }
    );
  }
}
