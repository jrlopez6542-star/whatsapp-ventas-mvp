import { NextRequest, NextResponse } from "next/server";
import { findUserByEmail, createSession, ensureInitialAdmin, listAllUsers } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/passwords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const inputPassword = typeof body.password === "string" ? body.password : "";

    if (!inputPassword) {
      return NextResponse.json({ ok: false, error: "La contraseña es requerida" }, { status: 400 });
    }

    // Si no se proveyó correo (formulario legado de sólo contraseña), asumir administrador principal
    const effectiveEmail = rawEmail || "admin@bunuelandia.co";

    // 1. Intentar buscar el usuario por correo
    let user = await findUserByEmail(effectiveEmail);

    // Si el usuario existe pero está inactivo/suspendido, rechazar de inmediato con 403
    if (user && !user.active) {
      return NextResponse.json(
        { ok: false, error: "Usuario inactivo o suspendido" },
        { status: 403 }
      );
    }

    // Si no existe ningún usuario en el sistema y es el primer arranque, inicializar bootstrap si corresponde
    if (!user) {
      const existingUsers = await listAllUsers();
      if (existingUsers.length === 0 && effectiveEmail === "admin@bunuelandia.co") {
        await ensureInitialAdmin();
        user = await findUserByEmail(effectiveEmail);
      }
    }

    let authenticated = false;
    let authenticatedUser = user;

    if (user && user.active) {
      authenticated = await verifyPassword(inputPassword, user.passwordHash);
    }

    // 2. Fallback de compatibilidad con PANEL_PASSWORD del entorno (SIN MUTAR LA BD)
    if (!authenticated) {
      const envPassword = (process.env.PANEL_PASSWORD || "").trim().replace(/^"|"$/g, "");
      const matchesEnv = Boolean(envPassword && inputPassword === envPassword);

      if (matchesEnv) {
        if (user) {
          // El usuario existe y está activo: se autentica temporalmente sin modificar su contraseña en BD
          authenticatedUser = user;
          authenticated = true;
        } else {
          // Si no existe, sólo se permite bootstrap inicial si el sistema no tiene ningún usuario registrado
          const currentUsers = await listAllUsers();
          if (currentUsers.length === 0) {
            await ensureInitialAdmin();
            const createdAdmin = await findUserByEmail("admin@bunuelandia.co");
            if (createdAdmin) {
              authenticatedUser = createdAdmin;
              authenticated = true;
            }
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
