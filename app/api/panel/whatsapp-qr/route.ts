import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getEvolutionConfig(instanceParam?: string | null) {
  const apiUrl = (process.env.EVOLUTION_API_URL || "http://localhost:8080").replace(/\/+$/, "");
  const apiKey = (
    process.env.EVOLUTION_API_KEY ||
    "99f58f55d074936b92aab5903ba5e0e7cb5e8c92001a4648e0211efccb31c20a"
  ).trim();
  const instance = (
    instanceParam ||
    process.env.EVOLUTION_INSTANCE ||
    "bot_whatsapp_mvp"
  ).trim();

  return { apiUrl, apiKey, instance };
}

export async function GET(request: NextRequest) {
  const instanceParam = request.nextUrl.searchParams.get("instance");
  const { apiUrl, apiKey, instance } = getEvolutionConfig(instanceParam);

  try {
    // 1. Verificar estado de conexión de la instancia
    const stateRes = await fetch(`${apiUrl}/instance/connectionState/${instance}`, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });

    let isConnected = false;
    let state = "unknown";

    if (stateRes.ok) {
      const stateData = await stateRes.json();
      state = stateData?.instance?.state || stateData?.state || "unknown";
      if (state === "open") {
        isConnected = true;
      }
    }

    // 2. Si ya está conectado, retornar datos del perfil
    if (isConnected) {
      let profile = null;
      try {
        const fetchRes = await fetch(`${apiUrl}/instance/fetchInstances`, {
          headers: { apikey: apiKey },
          cache: "no-store",
        });
        if (fetchRes.ok) {
          const list = await fetchRes.json();
          if (Array.isArray(list)) {
            const found = list.find((i: any) => i.name === instance);
            if (found) {
              profile = {
                ownerJid: found.ownerJid,
                profileName: found.profileName,
                profilePicUrl: found.profilePicUrl,
                number: found.number,
              };
            }
          }
        }
      } catch {}

      return NextResponse.json({
        ok: true,
        connected: true,
        state: "open",
        instance,
        profile,
      });
    }

    // 3. Si no está conectado, solicitar QR nuevo o vigente
    const connectRes = await fetch(`${apiUrl}/instance/connect/${instance}`, {
      headers: { apikey: apiKey },
      cache: "no-store",
    });

    if (!connectRes.ok) {
      const errText = await connectRes.text();
      return NextResponse.json(
        { ok: false, error: `Evolution connect error: ${errText}` },
        { status: 502 }
      );
    }

    const connectData = await connectRes.json();

    if (connectData?.instance?.state === "open") {
      return NextResponse.json({
        ok: true,
        connected: true,
        state: "open",
        instance,
      });
    }

    return NextResponse.json({
      ok: true,
      connected: false,
      state: "connecting",
      instance,
      base64: connectData.base64 || null,
      pairingCode: connectData.pairingCode || null,
      count: connectData.count || 1,
      expiresInSeconds: 30,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, instance: reqInstance } = await request.json();
    const { apiUrl, apiKey, instance } = getEvolutionConfig(reqInstance);

    if (action === "restart" || action === "renew") {
      const restartRes = await fetch(`${apiUrl}/instance/restart/${instance}`, {
        method: "POST",
        headers: { apikey: apiKey },
      });
      const data = await restartRes.json();
      return NextResponse.json({ ok: true, data });
    }

    if (action === "logout") {
      const logoutRes = await fetch(`${apiUrl}/instance/logout/${instance}`, {
        method: "DELETE",
        headers: { apikey: apiKey },
      });
      const data = await logoutRes.json();
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ ok: false, error: "Acción no reconocida" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

