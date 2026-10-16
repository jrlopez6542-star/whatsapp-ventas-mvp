"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
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
        body: JSON.stringify({
          email: email.trim() || undefined,
          password: password.trim(),
        }),
      });
      const data = await res.json();
      if (data.ok) {
        const next = searchParams.get("next") || "/panel";
        window.location.href = next;
      } else {
        setError(data.error || "Credenciales incorrectas");
      }
    } catch {
      setError("Error de conexión al servidor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 420,
        width: "100%",
        background: "var(--bg-card, #121b22)",
        border: "1px solid var(--border, #1f2c34)",
        borderRadius: 16,
        padding: "2.25rem",
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🥟</div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: "700", color: "#f1f5f9", margin: "0 0 0.25rem 0" }}>
          BUÑUELANDIA
        </h1>
        <p style={{ color: "var(--text-muted, #94a3b8)", fontSize: "0.875rem", margin: 0 }}>
          Panel de Control & Ventas WhatsApp
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
        {error && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              borderRadius: 8,
              fontSize: "0.85rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.825rem",
              fontWeight: 500,
              marginBottom: "0.4rem",
              color: "#cbd5e1",
            }}
          >
            Correo Electrónico
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@bunuelandia.co (opcional)"
            autoComplete="username"
            style={{
              width: "100%",
              padding: "0.75rem 0.9rem",
              borderRadius: 8,
              border: "1px solid var(--border, #2a3942)",
              background: "var(--bg, #0b141a)",
              color: "#f1f5f9",
              fontSize: "0.95rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: "block",
              fontSize: "0.825rem",
              fontWeight: 500,
              marginBottom: "0.4rem",
              color: "#cbd5e1",
            }}
          >
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            autoComplete="current-password"
            style={{
              width: "100%",
              padding: "0.75rem 0.9rem",
              borderRadius: 8,
              border: "1px solid var(--border, #2a3942)",
              background: "var(--bg, #0b141a)",
              color: "#f1f5f9",
              fontSize: "0.95rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            marginTop: "0.5rem",
            padding: "0.85rem",
            borderRadius: 8,
            border: "none",
            background: "#10b981",
            color: "#ffffff",
            fontSize: "0.95rem",
            fontWeight: "600",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
            opacity: loading ? 0.7 : 1,
            boxShadow: "0 4px 12px rgba(16, 185, 129, 0.25)",
          }}
        >
          {loading ? "Verificando acceso..." : "Entrar al Panel"}
        </button>
      </form>

      <div style={{ marginTop: "1.75rem", textAlign: "center" }}>
        <Link
          href="/"
          style={{
            color: "var(--text-muted, #94a3b8)",
            fontSize: "0.825rem",
            textDecoration: "none",
            transition: "color 0.15s ease",
          }}
        >
          ← Volver a inicio
        </Link>
      </div>
    </div>
  );
}

export default function PanelLoginPage() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        background: "#0b141a",
      }}
    >
      <Suspense fallback={<div style={{ color: "#94a3b8" }}>Cargando panel...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
