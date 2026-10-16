import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, createSession, ensureInitialAdmin } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = String(body.email || "").trim().toLowerCase();
    const inputPassword = String(body.password || "").trim().replace(/^"|"$/g, "");

    if (!inputPassword) {
      return NextResponse.json({ ok: false, error: "La contraseña es requerida" }, { status: 400 });
    }

    // Si no se proveyó correo (formulario legado de sólo contraseña), asumir administrador principal
    const effectiveEmail = rawEmail || "admin@bunuelandia.co";

    // 1. Intentar autenticar contra la base de datos de usuarios
    let user = await findUserByEmail(effectiveEmail);

    // Si no existe y el email es el admin por defecto, asegurar bootstrap si PANEL_PASSWORD existe
    if (!user && effectiveEmail === "admin@bunuelandia.co") {
      await ensureInitialAdmin();
      user = await findUserByEmail(effectiveEmail);
    }

    let authenticated = false;
    let authenticatedUser = user;

    if (user && user.active) {
      authenticated = await verifyPassword(inputPassword, user.passwordHash);
    }

    // 2. Fallback de transición si aún no se inicializó el usuario en Turso
    if (!authenticated) {
      const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
      if (envPassword && inputPassword === envPassword) {
        await ensureInitialAdmin();
        const createdAdmin = await findUserByEmail("admin@bunuelandia.co");
        if (createdAdmin) {
          authenticatedUser = createdAdmin;
          authenticated = true;
        }
      }
    }

    if (!authenticated || !authenticatedUser) {
      return NextResponse.json(
        { ok: false, error: "Correo o contraseña incorrectos" },
        { status: 401 }
      );
    }

    // 3. Crear sesión revocable en base de datos
    const userAgent = request.headers.get("user-agent") || undefined;
    const forwardedFor = request.headers.get("x-forwarded-for");
    const ipAddress = forwardedFor ? forwardedFor.split(",")[0].trim() : undefined;

    const { token } = await createSession(authenticatedUser.id, userAgent, ipAddress);

    const response = NextResponse.json({
      ok: true,
      user: {
        id: authenticatedUser.id,
        email: authenticatedUser.email,
        name: authenticatedUser.name,
        role: authenticatedUser.role,
      },
    });

    response.cookies.set("panel_session", token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    });

    return response;
  } catch (error) {
    console.error("[auth login error]", error);
    return NextResponse.json({ ok: false, error: "Error interno al procesar el inicio de sesión" }, { status: 500 });
  }
}
