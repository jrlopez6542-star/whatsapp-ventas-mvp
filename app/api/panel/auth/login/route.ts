import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  try {
    const { password } = await request.json();
    const envPassword = (process.env.PANEL_PASSWORD || "").trim();

    if (!envPassword || password === envPassword) {
      const token = await sha256Hex(`whatsapp-ventas-panel:${envPassword}`);
      const response = NextResponse.json({ ok: true });
      response.cookies.set("panel_session", token, {
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 días
      });
      return response;
    }

    return NextResponse.json({ ok: false, error: "Contraseña incorrecta" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "Petición inválida" }, { status: 400 });
  }
}
