import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { validateSession, isTokenRevoked, canonicalTokenHash, verifySignedToken } from "@/lib/auth/session";
import PanelDashboard from "./PanelDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Autorización definitiva de página privada en el servidor (Node.js).
 * El middleware actúa como filtro inicial rápido en Edge.
 * Este componente de servidor garantiza que ningún dato ni interfaz privada
 * se entregue al navegador si el token fue revocado, expiró o el usuario fue suspendido.
 */
export default async function PanelPage() {
  const cookieStore = await cookies();
  const panelCookie = cookieStore.get("panel_session")?.value?.trim();
  const crmCookie = cookieStore.get("crm_session")?.value?.trim();

  if (!panelCookie && !crmCookie) {
    redirect("/panel/login");
  }

  // 1. Candado estricto anti-revocación y firmas forjadas:
  for (const c of [panelCookie, crmCookie]) {
    if (c) {
      if (!verifySignedToken(c)) {
        redirect("/panel/login?error=invalid");
      }
      const hash = canonicalTokenHash(c);
      if (hash && (await isTokenRevoked(hash))) {
        redirect("/panel/login?error=revoked");
      }
    }
  }

  // 2. Validación definitiva de sesión activa y vigente en base de datos (Turso)
  const primaryToken = panelCookie || crmCookie;
  let user = await validateSession(primaryToken!);
  if (!user && panelCookie && crmCookie) {
    user = await validateSession(crmCookie);
  }

  if (!user || !user.active) {
    redirect("/panel/login");
  }

  return <PanelDashboard initialUser={user} />;
}
