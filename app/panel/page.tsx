"use client";

import { useEffect, useState } from "react";
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

export default function PanelDashboard() {
  const [tab, setTab] = useState<"chats" | "orders" | "catalog" | "settings">("chats");
  const [health, setHealth] = useState<any>(null);

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

  // Load initial data
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

  useEffect(() => {
    loadHealth();
    loadConversations();
    loadOrders();
    loadProducts();
    loadSettings();
  }, []);

  // Poll conversations every 10s
  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations();
    }, 10000);
    return () => clearInterval(timer);
  }, []);

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
    const timer = setInterval(loadMessages, 5000);
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
      // Refresh messages & convs
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
          <Link href="/" style={{ color: "var(--text)", textDecoration: "none", fontWeight: 700, fontSize: "1.1rem" }}>
            WhatsApp Ventas
          </Link>
          <span style={{ color: "var(--border)" }}>|</span>
          <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Panel Administrativo</span>
          {health && (
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <span className="lp-pill" style={{ background: health.channel !== "none" ? "rgba(37,211,102,0.15)" : "rgba(239,68,68,0.15)", color: health.channel !== "none" ? "var(--primary)" : "#ef4444" }}>
                Canal: {health.channel.toUpperCase()}
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

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", padding: "0 1.5rem", background: "var(--bg-card)" }}>
        {(["chats", "orders", "catalog", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "0.75rem 1.25rem",
              background: "transparent",
              border: "none",
              borderBottom: tab === t ? "2px solid var(--primary)" : "2px solid transparent",
              color: tab === t ? "var(--text)" : "var(--text-muted)",
              fontWeight: tab === t ? 600 : 400,
              cursor: "pointer",
              fontSize: "0.95rem",
              textTransform: "capitalize",
            }}
          >
            {t === "chats" ? "Bandeja de Entrada" : t === "orders" ? "Pedidos" : t === "catalog" ? "Catálogo" : "Configuración"}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <main style={{ flex: 1, padding: "1.5rem", maxWidth: 1200, width: "100%", margin: "0 auto" }}>
        {/* TAB 1: BANDEJA DE CHATS */}
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
                        <span style={{ fontWeight: 600, fontSize: "0.95rem" }}>{c.phone}</span>
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
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {new Date(c.updatedAt).toLocaleTimeString()} · {new Date(c.updatedAt).toLocaleDateString()}
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
                      <h3 style={{ fontSize: "1.05rem" }}>{selectedConv.phone}</h3>
                      <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                        Modo actual: <strong>{selectedConv.status}</strong>
                      </span>
                    </div>
                    <button
                      onClick={() => handleToggleStatus(selectedConv.id, selectedConv.status)}
                      className={`lp-btn ${selectedConv.status === "human" ? "lp-btn-primary" : "lp-btn-secondary"}`}
                      style={{ fontSize: "0.85rem", padding: "0.4rem 0.9rem" }}
                    >
                      {selectedConv.status === "human" ? "Devolver al Bot" : "Tomar Control (Humano)"}
                    </button>
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
                            {m.role === "user" ? "Cliente" : "Asistente / Humano"} · {new Date(m.createdAt).toLocaleTimeString()}
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

        {/* TAB 2: PEDIDOS */}
        {tab === "orders" && (
          <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 12, padding: "1.5rem" }}>
            <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Pedidos Registrados</h2>
            {orders.length === 0 ? (
              <p style={{ color: "var(--text-muted)" }}>No hay pedidos registrados todavía.</p>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--text-muted)" }}>
                    <th style={{ padding: "0.75rem" }}>ID</th>
                    <th style={{ padding: "0.75rem" }}>Cliente</th>
                    <th style={{ padding: "0.75rem" }}>Estado</th>
                    <th style={{ padding: "0.75rem" }}>Total (COP)</th>
                    <th style={{ padding: "0.75rem" }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.75rem", fontFamily: "monospace" }}>#{o.id.slice(0, 8)}</td>
                      <td style={{ padding: "0.75rem" }}>{o.conversationId}</td>
                      <td style={{ padding: "0.75rem" }}>
                        <span className="lp-pill" style={{ background: "rgba(56,189,248,0.2)", color: "var(--accent)" }}>
                          {o.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: "0.75rem", fontWeight: 600 }}>${o.total.toLocaleString("es-CO")}</td>
                      <td style={{ padding: "0.75rem", color: "var(--text-muted)" }}>
                        {new Date(o.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* TAB 3: CATÁLOGO */}
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

        {/* TAB 4: CONFIGURACIÓN */}
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
