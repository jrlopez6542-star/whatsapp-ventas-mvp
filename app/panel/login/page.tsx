"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/panel/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.ok) {
        const next = searchParams.get("next") || "/panel";
        router.push(next);
      } else {
        setError(data.error || "Contraseña inválida");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 400, width: "100%", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem" }}>
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>Acceso al Panel</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
        WhatsApp Ventas — Ingresa la contraseña de administración
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && (
          <div style={{ padding: "0.75rem", background: "#7f1d1d", color: "#fecaca", borderRadius: 6, fontSize: "0.85rem" }}>
            {error}
          </div>
        )}
        <div>
          <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.35rem", color: "var(--text-muted)" }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="PANEL_PASSWORD"
            required
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              fontSize: "1rem",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="lp-btn lp-btn-primary"
          style={{ width: "100%", marginTop: "0.5rem" }}
        >
          {loading ? "Entrando..." : "Iniciar Sesión"}
        </button>
      </form>
      <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
        <Link href="/" style={{ color: "var(--text-muted)", fontSize: "0.85rem", textDecoration: "none" }}>
          ← Volver a inicio
        </Link>
      </div>
    </div>
  );
}

export default function PanelLoginPage() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <Suspense fallback={<div style={{ color: "var(--text-muted)" }}>Cargando panel...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
