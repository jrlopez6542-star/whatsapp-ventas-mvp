"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Conversation {
  id: string;
  phone: string;
  status: "bot" | "human" | "closed";
  createdAt: number;
  updatedAt: number;
}

interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
}

interface Product {
  sku: string;
  name: string;
  price: number;
  active: boolean;
  description?: string;
}

interface Order {
  id: string;
  conversationId: string;
  customerName?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  itemsSummary?: string;
  status: "pending" | "confirmed" | "cancelled";
  total: number;
  createdAt: number;
}

interface OrgSettings {
  name: string;
  tone: string;
  welcomeMessage: string;
  rules: string;
}

interface QrStatus {
  connected: boolean;
  state: string;
  base64?: string | null;
  pairingCode?: string | null;
  count?: number;
  profile?: {
    ownerJid?: string;
    profileName?: string;
    profilePicUrl?: string;
    number?: string;
  } | null;
  instance: string;
}

export function formatPhoneDisplay(raw: string): string {
  if (!raw) return "Cliente WhatsApp";
  let str = raw.trim();
  // Decode base64 if needed (e.g. d2hhdHNhcHA6KzU3... -> whatsapp:+57...)
  if (/^[A-Za-z0-9+/=]{20,}$/.test(str) && (str.startsWith("d2hh") || str.length % 4 === 0)) {
    try {
      const decoded = typeof window !== "undefined" ? atob(str) : "";
      if (decoded.includes("whatsapp:") || decoded.includes("@") || /^\+?\d+$/.test(decoded)) {
        str = decoded;
      }
    } catch {}
  }

  // Handle LID privacy
  if (str.includes("lid:") || str.includes("@lid")) {
    const digits = str.replace(/[^0-9]/g, "");
    return `Cliente WhatsApp (...${digits.slice(-4)})`;
  }

  // Clean prefixes and domains
  str = str.replace(/^whatsapp:/i, "");
  str = str.replace(/@s\.whatsapp\.net$/i, "");
  str = str.replace(/@c\.us$/i, "");

  // Format Colombia mobile (+57 3XX XXX XXXX)
  const cleanDigits = str.replace(/\D/g, "");
  if (cleanDigits.length === 12 && cleanDigits.startsWith("573")) {
    return `+57 ${cleanDigits.slice(2, 5)} ${cleanDigits.slice(5, 8)} ${cleanDigits.slice(8)}`;
  }
  if (cleanDigits.length === 10 && cleanDigits.startsWith("3")) {
    return `+57 ${cleanDigits.slice(0, 3)} ${cleanDigits.slice(3, 6)} ${cleanDigits.slice(6)}`;
  }

  return str.startsWith("+") ? str : `+${str}`;
}

export function formatDateDisplay(ts: number | string | undefined): { time: string; date: string } {
  if (!ts) return { time: "Reciente", date: "Hoy" };
  let num = typeof ts === "number" ? ts : Number(ts);
  if (isNaN(num) || num <= 86400000) {
    if (typeof ts === "string") {
      const parsed = Date.parse(ts);
      if (!isNaN(parsed) && parsed > 86400000) {
        num = parsed;
      } else {
        return { time: "Reciente", date: "Hoy" };
      }
    } else {
      return { time: "Reciente", date: "Hoy" };
    }
  }
  if (num < 10000000000) {
    num *= 1000;
  }
  const d = new Date(num);
  return {
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: d.toLocaleDateString(),
  };
}

export default function PanelDashboard() {
  const [tab, setTab] = useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings">("whatsapp_qr");
  const [health, setHealth] = useState<any>(null);

  // WhatsApp Web QR state
  const [qrStatus, setQrStatus] = useState<QrStatus | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [isRenewing, setIsRenewing] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState("bot_whatsapp_mvp");

  // Conversations & Chat
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "bot" | "human">("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // Orders
  const [orders, setOrders] = useState<Order[]>([]);

  // Catalog
  const [products, setProducts] = useState<Product[]>([]);
  const [newSku, setNewSku] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Settings
  const [settings, setSettings] = useState<OrgSettings>({
    name: "",
    tone: "",
    welcomeMessage: "",
    rules: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load initial health and data
  const loadHealth = async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      setHealth(data);
    } catch {}
  };

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/panel/conversations");
      const data = await res.json();
      if (data.ok) setConversations(data.conversations || []);
    } catch {}
  };

  const loadOrders = async () => {
    try {
      const res = await fetch("/api/panel/orders");
      const data = await res.json();
      if (data.ok) setOrders(data.orders || []);
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const res = await fetch("/api/panel/products");
      const data = await res.json();
      if (data.ok) setProducts(data.products || []);
    } catch {}
  };

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/panel/settings");
      const data = await res.json();
      if (data.ok) setSettings(data.settings);
    } catch {}
  };

  // Fetch QR Code and Connection Status
  const fetchQrStatus = async (forceRenew = false) => {
    try {
      if (forceRenew) {
        setIsRenewing(true);
        await fetch("/api/panel/whatsapp-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "restart", instance: selectedInstance }),
        });
      }

      const res = await fetch(`/api/panel/whatsapp-qr?instance=${encodeURIComponent(selectedInstance)}`, {
        cache: "no-store",
      });
      const data = await res.json();

      if (data.ok) {
        setQrStatus(data);
        setQrError("");
        if (!data.connected) {
          setSecondsRemaining(30);
        }
      } else {
        setQrError(data.error || "No se pudo obtener el código QR");
      }
    } catch (err) {
      setQrError("Error conectando con el servicio de WhatsApp");
    } finally {
      setIsRenewing(false);
      setQrLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadHealth();
    loadConversations();
    loadOrders();
    loadProducts();
    loadSettings();
    setQrLoading(true);
    fetchQrStatus();
  }, []);

  // When changing instance
  useEffect(() => {
    setQrLoading(true);
    fetchQrStatus();
  }, [selectedInstance]);

  // QR Polling & Auto-Renewal Countdown
  useEffect(() => {
    if (tab !== "whatsapp_qr") return;

    // Countdown timer for renewal
    const countdownTimer = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          // Time expired, auto-renew QR!
          fetchQrStatus();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    // Fast status check every 3.5s to see if user scanned and is now connected
    const statusCheckTimer = setInterval(() => {
      fetch(`/api/panel/whatsapp-qr?instance=${encodeURIComponent(selectedInstance)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (data.ok) {
            setQrStatus((prev) => {
              if (prev && !prev.connected && data.connected) {
                // Just connected!
                return data;
              }
              // If base64 updated
              if (data.base64 && prev?.base64 !== data.base64) {
                return data;
              }
              return { ...prev, ...data };
            });
          }
        })
        .catch(() => {});
    }, 3500);

    return () => {
      clearInterval(countdownTimer);
      clearInterval(statusCheckTimer);
    };
  }, [tab, selectedInstance]);

  // Handle Logout / Disconnect WhatsApp
  const handleDisconnectWhatsapp = async () => {
    if (!confirm("¿Seguro que deseas desconectar la sesión de WhatsApp?")) return;
    try {
      await fetch("/api/panel/whatsapp-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout", instance: selectedInstance }),
      });
      fetchQrStatus(true);
    } catch {}
  };

  // Refresh data when switching tabs
  useEffect(() => {
    if (tab === "chats") {
      loadConversations();
    } else if (tab === "orders") {
      loadOrders();
    } else if (tab === "catalog") {
      loadProducts();
    } else if (tab === "settings") {
      loadSettings();
    }
  }, [tab]);

  // Periodic polling every 4s for real-time updates in chats and orders
  useEffect(() => {
    const timer = setInterval(() => {
      if (tab === "chats") loadConversations();
      if (tab === "orders") loadOrders();
    }, 4000);
    return () => clearInterval(timer);
  }, [tab]);

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConvId) {
      setMessages([]);
      return;
    }
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`);
        const data = await res.json();
        if (data.ok) setMessages(data.messages || []);
      } catch {}
    };
    loadMessages();
    const timer = setInterval(loadMessages, 3000);
    return () => clearInterval(timer);
  }, [selectedConvId]);

  const handleToggleStatus = async (convId: string, currentStatus: string) => {
    const nextStatus = currentStatus === "human" ? "bot" : "human";
    try {
      await fetch(`/api/panel/conversations/${encodeURIComponent(convId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      loadConversations();
    } catch {}
  };

  const handleDeleteConversation = async (convId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("¿Deseas eliminar esta conversación del panel?")) return;
    try {
      await fetch(`/api/panel/conversations/${encodeURIComponent(convId)}`, {
        method: "DELETE",
      });
      if (selectedConvId === convId) setSelectedConvId(null);
      loadConversations();
    } catch {}
  };

  const handleDeleteOrder = async (orderId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm("¿Deseas eliminar este pedido?")) return;
    try {
      await fetch(`/api/panel/orders/${encodeURIComponent(orderId)}`, {
        method: "DELETE",
      });
      loadOrders();
    } catch {}
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConvId || !replyText.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: replyText }),
      });
      setReplyText("");
      const res = await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`);
      const data = await res.json();
      if (data.ok) setMessages(data.messages || []);
      loadConversations();
    } catch {} finally {
      setSending(false);
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSku || !newName || !newPrice) return;
    try {
      await fetch("/api/panel/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: newSku,
          name: newName,
          price: Number(newPrice),
          description: newDesc,
          active: true,
        }),
      });
      setNewSku("");
      setNewName("");
      setNewPrice("");
      setNewDesc("");
      loadProducts();
    } catch {}
  };

  const handleToggleProduct = async (sku: string, currentActive: boolean) => {
    try {
      await fetch(`/api/panel/products/${encodeURIComponent(sku)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !currentActive }),
      });
      loadProducts();
    } catch {}
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSaveSuccess(false);
    try {
      await fetch("/api/panel/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {} finally {
      setSavingSettings(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/panel/auth/logout", { method: "POST" });
    window.location.href = "/panel/login";
  };

  const filteredConversations = conversations.filter((c) => {
    if (filter === "all") return true;
    return c.status === filter;
  });

  const selectedConv = conversations.find((c) => c.id === selectedConvId);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--text)" }}>
      {/* Top Navbar */}
      <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Link href="/" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 700, fontSize: "1.1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "#25d366", fontSize: "1.3rem" }}>💬</span> WhatsApp Ventas
          </Link>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Panel Administrativo</span>
          {health && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span className="lp-pill" style={{ background: qrStatus?.connected ? "rgba(37,211,102,0.15)" : "rgba(234,179,8,0.15)", color: qrStatus?.connected ? "var(--primary)" : "#eab308" }}>
                {qrStatus?.connected ? "● WhatsApp Conectado" : "○ WhatsApp Desconectado"}
              </span>
              <span className="lp-pill" style={{ background: health.tursoConfigured ? "rgba(56,189,248,0.15)" : "rgba(148,163,184,0.15)", color: health.tursoConfigured ? "var(--accent)" : "var(--text-muted)" }}>
                DB: {health.tursoConfigured ? "Turso" : "Memoria"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button onClick={handleLogout} className="ghost" style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.9rem" }}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", background: "var(--bg-card)" }}>
        {[
          { id: "whatsapp_qr", label: "📱 Vincular WhatsApp (QR)" },
          { id: "chats", label: "💬 Bandeja de Entrada" },
          { id: "orders", label: "📦 Pedidos" },
          { id: "catalog", label: "🏷️ Catálogo" },
          { id: "settings", label: "⚙️ Configuración" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            style={{
              padding: "0.85rem 1.25rem",
              background: "transparent",
              border: "none",
              borderBottom: tab === t.id ? "3px solid var(--primary)" : "3px solid transparent",
              color: tab === t.id ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t.id ? 700 : 500,
              cursor: "pointer",
              fontSize: "0.95rem",
              transition: "all 0.2s ease",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <main style={{ flex: 1, padding: "1.5rem", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        
        {/* ========================================================= */}
        {/* TAB: WHATSAPP WEB STYLE QR CODE                           */}
        {/* ========================================================= */}
        {tab === "whatsapp_qr" && (
          <div style={{ maxWidth: 960, margin: "1rem auto" }}>
            {/* WhatsApp Web Banner Header */}
            <div style={{ background: "#00a884", borderRadius: "16px 16px 0 0", padding: "1.25rem 2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem" }}>
                  📱
                </div>
                <div>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, color: "#ffffff", margin: 0 }}>
                    WhatsApp Web · Vinculación Oficial
                  </h2>
                  <p style={{ fontSize: "0.85rem", color: "#e6fffa", margin: 0 }}>
                    Conecta tu número comercial con el motor de Inteligencia Artificial
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.85rem", color: "#ffffff" }}>Instancia:</span>
                <select
                  value={selectedInstance}
                  onChange={(e) => setSelectedInstance(e.target.value)}
                  style={{
                    background: "rgba(0,0,0,0.25)",
                    border: "1px solid rgba(255,255,255,0.4)",
                    color: "#ffffff",
                    borderRadius: 6,
                    padding: "0.3rem 0.6rem",
                    fontSize: "0.85rem",
                    cursor: "pointer",
                  }}
                >
                  <option value="bot_whatsapp_mvp">bot_whatsapp_mvp (Por escanear)</option>
                  <option value="ventas2">ventas2 (Línea existente)</option>
                </select>
              </div>
            </div>

            {/* Main Card */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 16px 16px", padding: "2.5rem 2rem", boxShadow: "0 20px 40px rgba(0,0,0,0.5)" }}>
              {qrStatus?.connected ? (
                /* STATE: CONNECTED */
                <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
                  <div style={{ width: 80, height: 80, borderRadius: "50%", background: "rgba(37,211,102,0.15)", border: "2px solid #25d366", margin: "0 auto 1.5rem", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "2.5rem" }}>
                    ✅
                  </div>
                  <h2 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
                    ¡WhatsApp Conectado con Éxito!
                  </h2>
                  <p style={{ color: "var(--text-muted)", fontSize: "1.05rem", maxWidth: 500, margin: "0 auto 1.5rem" }}>
                    Tu línea de WhatsApp está sincronizada y respondiendo automáticamente cotizaciones y pedidos con IA.
                  </p>

                  <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.75rem", background: "#0b141a", border: "1px solid var(--border)", borderRadius: 12, padding: "1.25rem 2rem", textAlign: "left", marginBottom: "2rem", minWidth: 320 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Instancia activa:</span>
                      <strong style={{ color: "#25d366", fontSize: "0.9rem" }}>{qrStatus.instance}</strong>
                    </div>
                    {qrStatus.profile?.ownerJid && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Número conectado:</span>
                        <strong style={{ fontSize: "0.9rem" }}>{qrStatus.profile.ownerJid.replace("@s.whatsapp.net", "")}</strong>
                      </div>
                    )}
                    {qrStatus.profile?.profileName && (
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Nombre del perfil:</span>
                        <strong style={{ fontSize: "0.9rem" }}>{qrStatus.profile.profileName}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                      <span style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Estado de sesión:</span>
                      <span className="lp-pill" style={{ background: "rgba(37,211,102,0.2)", color: "#25d366", margin: 0 }}>
                        EN LÍNEA (OPEN)
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
                    <button
                      onClick={() => setTab("chats")}
                      className="lp-btn lp-btn-primary"
                      style={{ fontSize: "1rem", padding: "0.75rem 1.75rem" }}
                    >
                      Ir a la Bandeja de Mensajes →
                    </button>
                    <button
                      onClick={handleDisconnectWhatsapp}
                      className="lp-btn lp-btn-secondary"
                      style={{ fontSize: "1rem", padding: "0.75rem 1.75rem", color: "#f87171" }}
                    >
                      Desconectar WhatsApp
                    </button>
                  </div>
                </div>
              ) : (
                /* STATE: CONNECTING / QR DISPLAY */
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "3rem", alignItems: "center" }}>
                  {/* Left Column: Instructions estilo WhatsApp Web */}
                  <div>
                    <h2 style={{ fontSize: "1.6rem", fontWeight: 700, marginBottom: "1rem" }}>
                      Inicia sesión con tu WhatsApp
                    </h2>
                    <ol style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem", color: "var(--text)", fontSize: "1.05rem", lineHeight: 1.5 }}>
                      <li>
                        Abre <strong>WhatsApp</strong> en tu teléfono móvil.
                      </li>
                      <li>
                        Toca el menú de <strong>tres puntos ⋮</strong> (Android) o ve a <strong>Ajustes ⚙️</strong> (iPhone).
                      </li>
                      <li>
                        Selecciona <strong>Dispositivos vinculados</strong> y luego toca en <strong>Vincular un dispositivo</strong>.
                      </li>
                      <li>
                        Apunta tu teléfono hacia esta pantalla para <strong>escanear el código QR</strong>.
                      </li>
                    </ol>

                    <div style={{ marginTop: "2rem", padding: "1rem", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.3)", borderRadius: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--accent)", fontSize: "0.9rem", fontWeight: 600 }}>
                        <span>⚡</span> Renovación automática activa
                      </div>
                      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
                        Si el código vence, la pantalla solicitará automáticamente una nueva clave a Docker Evolution para que nunca se quede congelada.
                      </p>
                    </div>
                  </div>

                  {/* Right Column: QR Code Container */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div
                      style={{
                        background: "#ffffff",
                        padding: "1.25rem",
                        borderRadius: 16,
                        boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
                        position: "relative",
                        minWidth: 280,
                        minHeight: 280,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {qrLoading || isRenewing ? (
                        <div style={{ textAlign: "center", color: "#0b141a" }}>
                          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div>
                          <strong style={{ fontSize: "0.95rem" }}>Generando código QR...</strong>
                          <div style={{ fontSize: "0.8rem", color: "#64748b" }}>Conectando con Docker...</div>
                        </div>
                      ) : qrStatus?.base64 ? (
                        <div style={{ position: "relative" }}>
                          <img
                            src={qrStatus.base64}
                            alt="Código QR de WhatsApp"
                            style={{
                              width: 250,
                              height: 250,
                              display: "block",
                              borderRadius: 8,
                            }}
                          />
                        </div>
                      ) : (
                        <div style={{ textAlign: "center", color: "#0b141a", padding: "1rem" }}>
                          <div style={{ fontSize: "2rem", color: "#ef4444" }}>⚠️</div>
                          <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#b91c1c", marginTop: "0.5rem" }}>
                            {qrError || "No se pudo cargar el QR"}
                          </div>
                          <button
                            onClick={() => fetchQrStatus(true)}
                            className="lp-btn lp-btn-primary"
                            style={{ marginTop: "1rem", fontSize: "0.85rem" }}
                          >
                            Reintentar
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar & Countdown Timer */}
                    <div style={{ marginTop: "1.25rem", width: "100%", maxWidth: 280, textAlign: "center" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.4rem" }}>
                        <span>Expira en:</span>
                        <strong style={{ color: secondsRemaining <= 5 ? "#ef4444" : "var(--primary)" }}>
                          {secondsRemaining}s
                        </strong>
                      </div>
                      <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
                        <div
                          style={{
                            height: "100%",
                            width: `${(secondsRemaining / 30) * 100}%`,
                            background: secondsRemaining <= 5 ? "#ef4444" : "#25d366",
                            transition: "width 1s linear, background-color 0.3s",
                          }}
                        />
                      </div>
                      <button
                        onClick={() => fetchQrStatus(true)}
                        disabled={isRenewing}
                        style={{
                          marginTop: "1rem",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          color: "var(--text)",
                          padding: "0.5rem 1rem",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          transition: "border-color 0.2s",
                        }}
                      >
                        <span>🔄</span> {isRenewing ? "Renovando código..." : "Renovar código QR ahora"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 1: BANDEJA DE CHATS                                   */}
        {/* ========================================================= */}
        {tab === "chats" && (
          <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: "1.5rem", height: "calc(100vh - 180px)" }}>
            {/* Conversations List */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "1rem", borderBottom: "1px solid var(--border)", display: "flex", gap: "0.5rem" }}>
                {(["all", "bot", "human"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      flex: 1,
                      padding: "0.4rem",
                      borderRadius: 6,
                      fontSize: "0.8rem",
                      border: "1px solid var(--border)",
                      background: filter === f ? "var(--primary-bg)" : "transparent",
                      color: filter === f ? "var(--primary)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontWeight: 600,
                    }}
                  >
                    {f === "all" ? "Todos" : f === "bot" ? "Bot" : "Humano"}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filteredConversations.length === 0 ? (
                  <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.9rem" }}>
                    No hay conversaciones aún.
                  </div>
                ) : (
                  filteredConversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSelectedConvId(c.id)}
                      style={{
                        padding: "1rem",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        background: selectedConvId === c.id ? "#1a243b" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.25rem" }}>
                        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                          {formatPhoneDisplay(c.phone)}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <span
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.5rem",
                              borderRadius: 4,
                              background: c.status === "human" ? "rgba(239,68,68,0.2)" : "rgba(37,211,102,0.2)",
                              color: c.status === "human" ? "#f87171" : "var(--primary)",
                              fontWeight: 600,
                            }}
                          >
                            {c.status.toUpperCase()}
                          </span>
                          <button
                            onClick={(e) => handleDeleteConversation(c.id, e)}
                            title="Eliminar conversación"
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                              padding: "0.2rem",
                              fontSize: "0.85rem",
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {formatDateDisplay(c.updatedAt).time} · {formatDateDisplay(c.updatedAt).date}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Chat View */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selectedConv ? (
                <>
                  <div style={{ padding: "1rem 1.5rem", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3 style={{ fontSize: "1.05rem", margin: 0 }}>
                        {formatPhoneDisplay(selectedConv.phone)}
                      </h3>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Modo actual: <strong>{selectedConv.status}</strong>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <button
                        onClick={() => handleToggleStatus(selectedConv.id, selectedConv.status)}
                        className={`lp-btn ${selectedConv.status === "human" ? "lp-btn-primary" : "lp-btn-secondary"}`}
                        style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                      >
                        {selectedConv.status === "human" ? "Devolver al Bot" : "Tomar Control (Humano)"}
                      </button>
                      <button
                        onClick={() => handleDeleteConversation(selectedConv.id)}
                        className="lp-btn lp-btn-secondary"
                        style={{ fontSize: "0.85rem", padding: "0.4rem 0.7rem", color: "#f87171" }}
                        title="Eliminar conversación"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </div>

                  {/* Messages Bubble Area */}
                  <div style={{ flex: 1, padding: "1.5rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {messages.length === 0 ? (
                      <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: "2rem" }}>
                        Sin mensajes registrados.
                      </div>
                    ) : (
                      messages.map((m) => (
                        <div
                          key={m.id}
                          className={`lp-bubble ${m.role === "user" ? "lp-bubble-user" : "lp-bubble-bot"}`}
                          style={{
                            alignSelf: m.role === "user" ? "flex-start" : "flex-end",
                            background: m.role === "user" ? "#1e293b" : "#064e3b",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: "0.2rem" }}>
                            {m.role === "user" ? "Cliente" : "Asistente / Humano"} · {formatDateDisplay(m.createdAt).time}
                          </div>
                          <div>{m.content}</div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Manual Reply Box */}
                  <form onSubmit={handleSendReply} style={{ padding: "1rem", borderTop: "1px solid var(--border)", display: "flex", gap: "0.75rem" }}>
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Escribe una respuesta manual (activará el modo humano)..."
                      style={{
                        flex: 1,
                        padding: "0.75rem",
                        borderRadius: 8,
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text)",
                      }}
                    />
                    <button type="submit" disabled={sending} className="lp-btn lp-btn-primary">
                      {sending ? "Enviando..." : "Enviar"}
                    </button>
                  </form>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)" }}>
                  Selecciona una conversación de la lista para ver los mensajes.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* ========================================================= */}
        {/* TAB 2: PEDIDOS (SECCIÓN APARTE)                           */}
        {/* ========================================================= */}
        {tab === "orders" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
              <div>
                <h2 style={{ fontSize: "1.35rem", fontWeight: 700, margin: 0 }}>📦 Pedidos de Buñuelos Confirmados</h2>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", margin: "0.25rem 0 0" }}>
                  Aquí se registran automáticamente los pedidos cerrados por la IA con dirección y medio de pago.
                </p>
              </div>
              <button
                onClick={loadOrders}
                className="lp-btn lp-btn-secondary"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
              >
                🔄 Actualizar lista
              </button>
            </div>

            {orders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-muted)" }}>
                <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.5rem" }}>🥟</span>
                <p style={{ fontWeight: 600 }}>No hay pedidos confirmados todavía.</p>
                <p style={{ fontSize: "0.85rem" }}>Cuando un cliente confirme por WhatsApp con su dirección, aparecerá aquí inmediatamente.</p>
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)", fontSize: "0.8rem", textTransform: "uppercase" }}>
                      <th style={{ padding: "0.75rem" }}>ID</th>
                      <th style={{ padding: "0.75rem" }}>Cliente / Teléfono</th>
                      <th style={{ padding: "0.75rem" }}>Productos</th>
                      <th style={{ padding: "0.75rem" }}>📍 Dirección de Entrega</th>
                      <th style={{ padding: "0.75rem" }}>💵 Pago</th>
                      <th style={{ padding: "0.75rem" }}>Total (COP)</th>
                      <th style={{ padding: "0.75rem" }}>Estado</th>
                      <th style={{ padding: "0.75rem" }}>Fecha</th>
                        <th style={{ padding: "0.75rem" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.75rem", fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
                          #{o.id.slice(0, 8)}
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <div style={{ fontWeight: 600 }}>{o.customerName || "Cliente"}</div>
                          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{formatPhoneDisplay(o.conversationId)}</div>
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span style={{ background: "rgba(255,255,255,0.06)", padding: "0.25rem 0.5rem", borderRadius: 4, fontSize: "0.85rem" }}>
                            {o.itemsSummary || "Buñuelos"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", maxWidth: 220, wordBreak: "break-word" }}>
                          <span style={{ color: "#fef08a", fontWeight: 500 }}>
                            {o.deliveryAddress || "Por confirmar"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span style={{ background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "0.2rem 0.5rem", borderRadius: 4, fontWeight: 600, fontSize: "0.8rem" }}>
                            {o.paymentMethod || "Efectivo"}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", fontWeight: 700, fontSize: "1rem", color: "#38bdf8" }}>
                          ${o.total.toLocaleString("es-CO")}
                        </td>
                        <td style={{ padding: "0.75rem" }}>
                          <span
                            className="lp-pill"
                            style={{
                              background: o.status === "confirmed" ? "rgba(34,197,94,0.2)" : "rgba(56,189,248,0.2)",
                              color: o.status === "confirmed" ? "#4ade80" : "var(--accent)",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                            }}
                          >
                            {o.status.toUpperCase()}
                          </span>
                        </td>
                        <td style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                          {formatDateDisplay(o.createdAt).time}
                          <br />
                          {formatDateDisplay(o.createdAt).date}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 3: CATÁLOGO                                           */}
        {/* ========================================================= */}
        {tab === "catalog" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 350px", gap: "1.5rem" }}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Productos en Catálogo</h2>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "0.75rem" }}>SKU</th>
                    <th style={{ padding: "0.75rem" }}>Nombre</th>
                    <th style={{ padding: "0.75rem" }}>Precio</th>
                    <th style={{ padding: "0.75rem" }}>Estado</th>
                    <th style={{ padding: "0.75rem" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.sku} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>{p.sku}</td>
                      <td style={{ padding: "0.75rem" }}>{p.name}</td>
                      <td style={{ padding: "0.75rem", fontWeight: 600 }}>${p.price.toLocaleString("es-CO")} COP</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className="lp-pill" style={{ background: p.active ? "rgba(37,211,102,0.15)" : "rgba(148,163,184,0.15)", color: p.active ? "var(--primary)" : "var(--text-muted)" }}>
                          {p.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem" }}>
                        <button
                          onClick={() => handleToggleProduct(p.sku, p.active)}
                          className="ghost"
                          style={{ background: "transparent", border: "1px solid var(--border)", padding: "0.3rem 0.6rem", borderRadius: 4, color: "var(--text)", cursor: "pointer", fontSize: "0.8rem" }}
                        >
                          {p.active ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Create Product Form */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
              <h3 style={{ fontSize: "1.1rem", marginBottom: "1rem" }}>Agregar Producto</h3>
              <form onSubmit={handleCreateProduct} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>SKU</label>
                  <input
                    type="text"
                    required
                    value={newSku}
                    onChange={(e) => setNewSku(e.target.value)}
                    placeholder="KIT-01"
                    style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Nombre</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Kit Emprendedor"
                    style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Precio (COP)</label>
                  <input
                    type="number"
                    required
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="45000"
                    style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.3rem" }}>Descripción</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Detalles del producto..."
                    style={{ width: "100%", padding: "0.6rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", resize: "vertical" }}
                  />
                </div>
                <button type="submit" className="lp-btn lp-btn-primary" style={{ width: "100%" }}>
                  Guardar Producto
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 4: CONFIGURACIÓN                                      */}
        {/* ========================================================= */}
        {tab === "settings" && (
          <div style={{ maxWidth: 700, margin: "0 auto", background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "2rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "0.5rem" }}>Configuración del Negocio</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
              Estos parámetros se inyectan directamente en el system prompt del agente de ventas con IA.
            </p>
            {saveSuccess && (
              <div style={{ padding: "0.75rem", background: "rgba(37,211,102,0.2)", color: "var(--primary)", borderRadius: 6, marginBottom: "1rem" }}>
                Configuración guardada exitosamente.
              </div>
            )}
            <form onSubmit={handleSaveSettings} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Nombre del Negocio
                </label>
                <input
                  type="text"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Tono de Comunicación
                </label>
                <input
                  type="text"
                  value={settings.tone}
                  onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Mensaje de Bienvenida
                </label>
                <textarea
                  rows={3}
                  value={settings.welcomeMessage}
                  onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                  Reglas de Negocio / Políticas
                </label>
                <textarea
                  rows={4}
                  value={settings.rules}
                  onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
                  style={{ width: "100%", padding: "0.75rem", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" }}
                />
              </div>
              <button type="submit" disabled={savingSettings} className="lp-btn lp-btn-primary" style={{ alignSelf: "flex-start" }}>
                {savingSettings ? "Guardando..." : "Guardar Cambios"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
