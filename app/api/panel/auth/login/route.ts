import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, createSession, ensureInitialAdmin, updateUser } from "@/lib/auth/session";
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
      if (!authenticated && body.password) {
        authenticated = await verifyPassword(String(body.password).trim(), user.passwordHash);
      }
    }

    // 2. Fallback de sincronización si PANEL_PASSWORD del entorno coincide con la clave provista
    if (!authenticated) {
      const envPassword = (process.env.PANEL_PASSWORD || "").trim();
      const cleanEnv = envPassword.replace(/^"|"$/g, "");
      const rawBodyPass = String(body.password || "").trim();
      const matchesEnv =
        (cleanEnv && (inputPassword === cleanEnv || rawBodyPass === cleanEnv)) ||
        (envPassword && (inputPassword === envPassword || rawBodyPass === envPassword));

      if (matchesEnv) {
        if (user) {
          await updateUser(user.id, { password: cleanEnv });
          authenticatedUser = await findUserByEmail(effectiveEmail);
          authenticated = true;
        } else {
          await ensureInitialAdmin();
          const createdAdmin = await findUserByEmail("admin@bunuelandia.co");
          if (createdAdmin) {
            authenticatedUser = createdAdmin;
            authenticated = true;
          }
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

    const cookieOptions = {
      httpOnly: true,
      path: "/",
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 7, // 7 días
    };

    response.cookies.set("panel_session", token, cookieOptions);
    response.cookies.set("crm_session", token, cookieOptions);

    return response;
  } catch (error) {
    console.error("[auth login error]", error);
    return NextResponse.json({ ok: false, error: "Error interno al procesar el inicio de sesión" }, { status: 500 });
  }
}
