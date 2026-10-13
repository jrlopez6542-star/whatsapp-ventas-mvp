"use client";
import React, { useEffect, useRef, useState } from "react";
import { QrModal } from "./QrModal";
import Script from 'next/script';
import Link from "next/link";
import { DashboardView } from "./DashboardView";
import { SettingsView } from "./SettingsView";
import { OrdersView } from "./OrdersView";
import { CatalogView } from "./CatalogView";
import { HoursView } from "./HoursView";
import {
  formatMessageTime,
  formatConversationListTime,
  getChatDateDivider,
  getChatDateKey,
  formatDateDisplay,
} from "@/lib/date-utils";
export { formatDateDisplay };
import "../crm.css";

interface Conversation {
  id: string;
  phone: string;
  customerName?: string;
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
  phone?: string;
  deliveryAddress?: string;
  paymentMethod?: string;
  itemsSummary?: string;
  deliveryFee?: number;
  changeAmount?: string;
  deliveryNotes?: string;
  status: string;
  total: number;
  createdAt: number;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  pending: {
    label: "Pendiente",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/20",
    icon: "ph-clock",
  },
  confirmed: {
    label: "Confirmado",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
    icon: "ph-check",
  },
  preparing: {
    label: "En Preparación",
    bg: "bg-orange-500/10",
    text: "text-orange-400",
    border: "border-orange-500/20",
    icon: "ph-fire",
  },
  delivering: {
    label: "En Camino",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    border: "border-indigo-500/20",
    icon: "ph-moped",
  },
  delivered: {
    label: "Entregado",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
    icon: "ph-check-circle",
  },
  cancelled: {
    label: "Cancelado",
    bg: "bg-red-500/10",
    text: "text-red-400",
    border: "border-red-500/20",
    icon: "ph-x-circle",
  },
};

interface OrgSettings {
  name: string;
  tone: string;
  welcomeMessage: string;
  rules: string;
  businessHoursEnabled?: string;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  outOfHoursMessage?: string;
  extraPrompt?: string;
  botObjective?: string;
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

export default function PanelDashboard() {
  const [tab, setTab] = useState<"whatsapp_qr" | "chats" | "orders" | "catalog" | "settings" | "hours" | "real_orders">("orders");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('crm_mobile_mode');
      if (saved !== null) {
        setIsMobileMode(saved === 'true');
      } else if (window.innerWidth < 768) {
        setIsMobileMode(true);
      }
    }
  }, []);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileDetails, setShowMobileDetails] = useState(false);
  const [health, setHealth] = useState<any>(null);

  // Master switch for the bot
  const [botEnabled, setBotEnabled] = useState(true);
  const [togglingBot, setTogglingBot] = useState(false);

  useEffect(() => {
    fetch("/api/panel/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.settings) {
          setBotEnabled(d.settings.botEnabled !== "false");
        }
      })
      .catch(() => {});
  }, []);

  const handleToggleBotMaster = async (active: boolean) => {
    setTogglingBot(true);
    setBotEnabled(active);
    try {
      await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botEnabled: active ? "true" : "false" }),
      });
    } catch {
      alert("Error al cambiar el estado general del bot.");
    } finally {
      setTogglingBot(false);
    }
  };

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
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "bot" | "human" | "closed">("all");
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const handleToggleBot = async (id: string, newStatus: string) => {
    if (!id) return;
    try {
      setConversations(prev => prev.map(c => c.id === id ? { ...c, status: newStatus as any } : c));
      const res = await fetch(`/api/panel/conversations/${encodeURIComponent(id)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await loadConversations();
      }
    } catch (e) {
      console.error("Error updating status:", e);
    }
  };
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
        const res = await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`, { cache: "no-store" });
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
    if (!confirm("¿Deseas eliminar esta conversación? Se borrará del panel y se sincronizará la eliminación en la app de WhatsApp.")) return;
    try {
      await fetch(`/api/panel/conversations/${encodeURIComponent(convId)}`, {
        cache: "no-store",
        method: "DELETE",
      });
      if (selectedConvId === convId) {
        setSelectedConvId(null);
        setMessages([]);
      }
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

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/panel/orders/${encodeURIComponent(orderId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notifyCustomer: true }),
      });
      if (res.ok) {
        await loadOrders();
      }
    } catch {}
  };

  const handleSendReply = async (e?: any) => {
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
      const res = await fetch(`/api/panel/conversations/${encodeURIComponent(selectedConvId)}/messages`, { cache: "no-store" });
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
  const selectedConvDigits = selectedConvId ? selectedConvId.replace(/\D/g, "").slice(-10) : "";
  const clientOrders = orders.filter((o) => {
    if (!selectedConvId) return false;
    if (o.conversationId === selectedConvId) return true;
    if (selectedConvDigits && o.conversationId.replace(/\D/g, "").includes(selectedConvDigits)) return true;
    return false;
  });

    return (
    <>
      <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
      <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      <style>{`
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #475569; }
        input:focus { outline: none; }
      `}</style>
      
      <div className={`bg-[#0b141a] text-slate-300 font-sans antialiased h-screen w-screen overflow-hidden flex select-none text-[13px] ${isMobileMode ? '' : ''}`}>
        
        
        {/* QR MODAL */}
        {showQrModal && <QrModal onClose={() => setShowQrModal(false)} />}
        
        {/* HAMBURGER MENU (MOBILE ONLY) */}
        {isMobileMode && !showMobileSidebar && !(tab === "chats" && selectedConvId) && (
          <button 
            onClick={() => setShowMobileSidebar(true)} 
            className="fixed top-4 left-4 z-[999999] bg-[#007aff] hover:bg-[#005bb5] text-white p-3 rounded-full shadow-2xl transition-transform flex items-center justify-center"
          >
            <i className="ph ph-list text-xl"></i>
          </button>
        )}

        

        {/* MAIN CONTAINER (MOBILE FRAME OR FULL SCREEN) */}
        <div className={isMobileMode ? "w-full h-full flex-1 bg-[#0b141a] relative overflow-hidden flex" : "flex-1 flex overflow-hidden w-full h-full"}>

        
        {/* 1. BARRA LATERAL IZQUIERDA (NAVEGACIÓN) */}
        <aside className={`${isMobileMode ? (showMobileSidebar ? 'absolute inset-y-0 left-0 w-[260px] z-50 transition-transform translate-x-0' : 'absolute inset-y-0 left-0 w-[260px] z-50 transition-transform -translate-x-full') : 'w-[220px]'} bg-[#121b22] border-r border-[#1f2c34] flex flex-col justify-between shrink-0`}>
          {isMobileMode && showMobileSidebar && (
             <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setShowMobileSidebar(false)}></div>
          )}
          <div>
            {/* Header / Logo */}
            <div className="h-16 flex items-center gap-3 px-4">
              <div className="text-[#25D366] text-3xl">
                <i className="ph-fill ph-whatsapp-logo"></i>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#25D366] font-medium">
                <span className="w-2 h-2 rounded-full bg-[#25D366] animate-pulse"></span>
                API Conectada
              </div>
            </div>

            {/* BOT MASTER SWITCH */}
            <div className="mx-2 mb-2 p-2.5 bg-[#162128] border border-[#2a3942] rounded-lg flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <i className={`ph-fill ph-robot text-lg ${botEnabled ? 'text-emerald-400' : 'text-red-400'}`}></i>
                <div>
                  <div className="text-[11px] font-bold text-white uppercase leading-tight">
                    {botEnabled ? "Bot Activo" : "Bot Pausado"}
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                    {botEnabled ? "Auto-respuesta ON" : "Modo Manual (OFF)"}
                  </div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={botEnabled}
                  disabled={togglingBot}
                  onChange={(e) => handleToggleBotMaster(e.target.checked)}
                />
                <div className="w-8 h-4 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
              </label>
            </div>

            <nav className="px-2 mt-2 space-y-1 text-[13px] font-medium text-slate-400">
              <button onClick={() => { setTab("real_orders" as any); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='real_orders' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-receipt text-lg"></i> Pedidos
              </button>
              <button onClick={() => { setTab("orders"); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='orders' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-squares-four text-lg"></i> Dashboard
              </button>
              <button onClick={() => { setTab("chats"); setShowMobileSidebar(false); }} className={`w-full flex items-center justify-between px-3 py-2 rounded-md transition ${tab==='chats' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <div className="flex items-center gap-3">
                  <i className="ph ph-chat-circle-dots text-lg"></i> Chats en vivo
                </div>
                <span className="bg-[#007aff] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conversations.length}</span>
              </button>
              <button onClick={() => { setTab("catalog"); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='catalog' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-coffee text-lg text-amber-400"></i> Menú y Bebidas
              </button>
              <button onClick={() => { setTab("hours"); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='hours' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-clock text-lg text-indigo-400"></i> Horarios
              </button>
              <button onClick={() => { setTab("settings"); setShowMobileSidebar(false); }} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition ${tab==='settings' ? 'bg-[#202c33] text-white' : 'hover:bg-[#202c33] hover:text-white'}`}>
                <i className="ph ph-gear text-lg"></i> Configuración
              </button>
            </nav>
          </div>

          <div className="p-2 space-y-1">
              <button onClick={() => setIsMobileMode(prev => {
                const next = !prev;
                if (typeof window !== "undefined") localStorage.setItem("crm_mobile_mode", String(next));
                return next;
              })} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
                {isMobileMode ? (
                  <><i className="ph ph-desktop text-lg"></i> Modo Escritorio</>
                ) : (
                  <><i className="ph ph-device-mobile text-lg"></i> Modo Móvil</>
                )}
              </button>
            <button onClick={() => setShowQrModal(true)} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-slate-400 hover:bg-[#202c33] hover:text-white">
              <i className="ph ph-qr-code text-lg"></i> Vincular WhatsApp
            </button>
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-md transition text-[#ef4444] hover:bg-[#ef4444]/10">
              <i className="ph ph-sign-out text-lg"></i> Cerrar Sesión
            </button>
          </div>
        </aside>

        {tab === "chats" && (
          <>
            {/* 2. BANDEJA DE CHATS */}
            <section className={`${isMobileMode ? (selectedConvId ? 'hidden' : 'w-full') : 'w-[340px]'} bg-[#111b21] border-r border-[#1f2c34] flex flex-col shrink-0`}>
              <div className="p-4 pb-2 border-b border-[#1f2c34]">
                <div className="flex items-center gap-3 mb-4">
                  {isMobileMode && (
                    <button onClick={() => setShowMobileSidebar(true)} className="text-white p-1 hover:bg-[#202c33] rounded">
                      <i className="ph ph-list text-2xl"></i>
                    </button>
                  )}
                  <h2 className="text-xl font-bold text-white">Chats en Vivo</h2>
                </div>
                <div className="relative mb-4">
                  <i className="ph ph-magnifying-glass absolute left-3 top-2.5 text-slate-400 text-base"></i>
                  <input 
                    type="text" 
                    placeholder="Buscar conversación..." 
                    className="w-full bg-[#202c33] text-sm text-white placeholder-slate-400 pl-9 pr-3 py-2 rounded-lg border border-transparent focus:border-[#1f2c34] transition"
                  />
                </div>

                <div className="flex gap-4 text-[13px] font-medium border-b border-[#1f2c34]">
                  <button onClick={() => setFilter("all")} className={`pb-2 ${filter === "all" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}`}>Todos</button>
                  <button onClick={() => setFilter("human")} className={`pb-2 ${filter === "human" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}`}>Esperando Asesor</button>
                  <button onClick={() => setFilter("bot")} className={`pb-2 ${filter === "bot" ? "text-[#007aff] border-b-2 border-[#007aff]" : "text-slate-400 hover:text-slate-200"}`}>Bot Activo</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {filteredConversations.map((conv) => {
                  const isActive = selectedConvId === conv.id;
                  const isHuman = conv.status === "human";
                  const isClosed = conv.status === "closed";
                  const formatPhoneLocal = (p: string) => p ? p.replace(/[^0-9]/g, '').slice(-10) : '';
                  
                  return (
                    <div key={conv.id} onClick={() => setSelectedConvId(conv.id)} className={`px-4 py-3 cursor-pointer transition border-b border-[#1f2c34] ${isActive ? 'bg-[#202c33]' : 'hover:bg-[#202c33]/50'}`}>
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0">
                          <img src={`https://api.dicebear.com/7.x/initials/svg?seed=${conv.customerName || conv.phone || conv.id}&backgroundColor=202c33&textColor=ffffff`} className="w-12 h-12 rounded-full object-cover border border-[#1f2c34]" alt="" />
                          {isHuman && <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#f59e0b] border-2 border-[#111b21] rounded-full flex items-center justify-center"><i className="ph-fill ph-warning text-[10px] text-white"></i></span>}
                          {!isHuman && !isClosed && <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#22c55e] border-2 border-[#111b21] rounded-full flex items-center justify-center"><i className="ph-fill ph-check text-[10px] text-white"></i></span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline mb-1">
                            <h3 className="text-[15px] font-semibold text-white truncate">{conv.customerName || formatPhoneLocal(conv.phone) || formatPhoneLocal(conv.id)}</h3>
                            <span className="text-xs text-slate-400">{formatConversationListTime(conv.updatedAt)}</span>
                          </div>
                          
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className="text-xs text-slate-400 font-mono">{formatPhoneLocal(conv.phone) || formatPhoneLocal(conv.id)}</span>
                            {conv.customerName && (
                              <span className="text-[10px] bg-[#2a3942] text-slate-300 px-1.5 py-0.2 rounded font-sans">
                                Cliente
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 mb-1">
                            {isHuman && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20">
                                <i className="ph-fill ph-warning"></i> Requiere Humano
                              </span>
                            )}
                            {!isHuman && !isClosed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/20">
                                <i className="ph-fill ph-robot"></i> Bot Activo
                              </span>
                            )}
                            {isClosed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-[#64748b]/20 text-[#cbd5e1] border border-[#64748b]/30">
                                <i className="ph ph-check"></i> Finalizado
                              </span>
                            )}
                          </div>
                          
                          <p className="text-sm text-slate-400 truncate">Conversación activa</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 3. ÁREA PRINCIPAL */}
            <main className={`${isMobileMode ? (selectedConvId ? "w-full" : "hidden") : "flex-1"} bg-[#0b141a] flex flex-col justify-between relative overflow-hidden`} style={{backgroundImage: "url('https://whatsapp-ventas-mvp.vercel.app/bg-chat.png')", backgroundSize: 'cover', backgroundBlendMode: 'overlay', backgroundColor: 'rgba(11,20,26,0.95)'}}>
              {selectedConvId ? (
                <>
                  <header className="h-16 bg-[#121b22] px-6 flex items-center justify-between z-10 shrink-0 border-b border-[#1f2c34]">
                    <div className="flex items-center gap-3">
                      {isMobileMode && (
                        <button onClick={() => setSelectedConvId(null)} className="mr-2 text-slate-300 hover:text-white flex items-center">
                          <i className="ph ph-caret-left text-2xl"></i>
                        </button>
                      )}
                      <div>
                        <h2 className="text-[16px] font-bold text-white leading-tight">
                          {conversations.find(c => c.id === selectedConvId)?.customerName || selectedConvId.replace(/[^0-9]/g, '').slice(-10)}
                        </h2>
                        <p className="text-xs text-slate-400">
                          {selectedConvId.replace(/[^0-9]/g, '').slice(-10)}
                          {conversations.find(c => c.id === selectedConvId)?.customerName ? " • Cliente Registrado" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isMobileMode && (
                        <button onClick={() => setShowMobileDetails(true)} className="text-slate-300 hover:text-white p-2 text-xl rounded-lg hover:bg-[#202c33] transition" title="Detalles del contacto">
                          <i className="ph ph-info"></i>
                        </button>
                      )}
                    </div>
                  </header>

                  <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    {messages.map((m, idx) => {
                      const isBot = m.role === "assistant";
                      const prevMsg = idx > 0 ? messages[idx - 1] : null;
                      const isNewDay = !prevMsg || getChatDateKey(m.createdAt) !== getChatDateKey(prevMsg.createdAt);
                      
                      const btnRegex = /\[BOTONES:\s*(.+?)\]/i;
                      const match = m.content.match(btnRegex);
                      let text = m.content;
                      if (match) {
                        const buttons = match[1].split('|').map(b => b.trim()).filter(b => b);
                        const optionsText = buttons.length > 0 ? '\n\n' + buttons.map((b, i) => `${i + 1}️⃣ ${b}`).join('\n') : '';
                        text = m.content.replace(btnRegex, '').trim() + optionsText;
                      }

                      return (
                        <React.Fragment key={m.id || idx}>
                          {isNewDay && (
                            <div className="flex justify-center my-3">
                              <span className="bg-[#182229] text-slate-400 text-[11px] px-3 py-1 rounded-lg uppercase tracking-wider font-medium shadow-sm border border-[#222e35]">
                                {getChatDateDivider(m.createdAt)}
                              </span>
                            </div>
                          )}
                          {isBot ? (
                            <div className="flex flex-col items-start w-full">
                              <div className="bg-[#202c33] text-slate-200 p-3 rounded-lg rounded-tl-none text-[14.5px] max-w-md shadow-sm border border-transparent">
                                <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                                <div className="text-[11px] text-slate-400 text-right mt-1">{formatMessageTime(m.createdAt)}</div>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-end w-full">
                              <div className="bg-[#005c4b] text-white p-3 rounded-lg rounded-tr-none text-[14.5px] max-w-md shadow-sm">
                                <p className="whitespace-pre-wrap leading-relaxed">{text}</p>
                                <div className="flex items-center justify-end gap-1 text-[11px] text-teal-100/70 mt-1">
                                  <span>{formatMessageTime(m.createdAt)}</span>
                                  <i className="ph-fill ph-checks text-[#53bdeb] text-sm"></i>
                                </div>
                              </div>
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  <div className="p-3 bg-[#121b22] flex items-center gap-3 shrink-0 border-t border-[#1f2c34]">
                    <button className="text-slate-400 hover:text-white p-2 rounded-lg transition">
                      <i className="ph ph-paperclip text-[22px]"></i>
                    </button>
                    <input 
                      type="text" 
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                      placeholder="Escribe un mensaje como asesor..." 
                      className="flex-1 bg-[#202c33] text-[15px] text-white placeholder-slate-400 px-4 py-3 rounded-lg border-none focus:ring-0 transition"
                    />
                    <button onClick={() => handleSendReply()} className="bg-[#202c33] hover:bg-[#2a3942] text-slate-300 p-3 rounded-lg transition flex items-center justify-center">
                      <i className="ph-fill ph-paper-plane-tilt text-xl"></i>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500">
                  Selecciona un chat para comenzar
                </div>
              )}
            </main>

            {/* 4. DETALLES (Right Sidebar) */}
            {selectedConvId && (
              <aside className={`${isMobileMode ? (showMobileDetails ? 'absolute inset-y-0 right-0 w-[280px] z-50 transition-transform translate-x-0' : 'absolute inset-y-0 right-0 w-[280px] z-50 transition-transform translate-x-full') : 'w-[280px]'} bg-[#121b22] border-l border-[#1f2c34] flex flex-col shrink-0 overflow-y-auto`}>
                {isMobileMode && showMobileDetails && (
                   <div className="fixed inset-0 bg-black/50 z-[-1]" onClick={() => setShowMobileDetails(false)}></div>
                )}
                {isMobileMode && (
                  <div className="p-4 border-b border-[#1f2c34] flex justify-between items-center bg-[#111b21]">
                    <span className="font-bold text-white">Detalles</span>
                    <button onClick={() => setShowMobileDetails(false)} className="text-slate-400 hover:text-white text-xl"><i className="ph ph-x"></i></button>
                  </div>
                )}
                
                <div className="p-5 border-b border-[#1f2c34]">
                  <h3 className="font-bold text-white text-base mb-4">Detalles del Contacto</h3>
                  <div className="mb-4">
                    <h4 className="font-semibold text-slate-200 text-sm">
                      {conversations.find(c => c.id === selectedConvId)?.customerName || selectedConvId.replace(/[^0-9]/g, '').slice(-10)}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">{selectedConvId.replace(/[^0-9]/g, '').slice(-10)}</p>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-[#007aff] bg-[#007aff]/10 px-2 py-1 rounded border border-[#007aff]/20 font-medium">[Cliente Nuevo]</span>
                    {conversations.find(c => c.id === selectedConvId)?.status === "human" && (
                      <span className="text-xs text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-1 rounded border border-[#f59e0b]/20 font-medium">[Prioridad]</span>
                    )}
                  </div>
                </div>

                {/* PEDIDOS DEL CLIENTE CON SELECTOR DE ESTADOS */}
                <div className="p-5 border-b border-[#1f2c34]">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <i className="ph-fill ph-package text-[#007aff]"></i>
                      Pedidos ({clientOrders.length})
                    </h3>
                    {clientOrders.length > 0 && (
                      <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-medium">
                        Notifica por WhatsApp
                      </span>
                    )}
                  </div>

                  {clientOrders.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No hay pedidos registrados para este cliente.</p>
                  ) : (
                    <div className="space-y-3">
                      {clientOrders.map((ord) => {
                        const statusCfg = STATUS_CONFIG[ord.status] || STATUS_CONFIG.pending;
                        return (
                          <div key={ord.id} className="bg-[#162128] border border-[#2a3942] rounded-lg p-3 text-xs space-y-2 shadow-sm">
                            <div className="flex items-center justify-between font-mono">
                              <span className="font-bold text-white">#{ord.id.slice(0, 8)}</span>
                              <span className="text-emerald-400 font-bold">${ord.total.toLocaleString("es-CO")}</span>
                            </div>

                            {ord.itemsSummary && (
                              <p className="text-slate-300 text-[11px] leading-snug font-sans">
                                {ord.itemsSummary}
                              </p>
                            )}

                            {ord.deliveryAddress && (
                              <div className="text-[11px] text-slate-400 flex items-start gap-1">
                                <i className="ph ph-map-pin text-slate-500 shrink-0 mt-0.5"></i>
                                <span className="truncate">{ord.deliveryAddress}</span>
                              </div>
                            )}

                            {/* SELECTOR DESPLEGABLE DE ESTADO */}
                            <div className="pt-2 border-t border-[#2a3942]/60">
                              <label className="text-[10px] text-slate-400 uppercase font-semibold block mb-1">
                                Estado del Pedido:
                              </label>
                              <select
                                value={ord.status}
                                onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                                className={`w-full text-xs font-semibold px-2 py-1.5 rounded border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border} bg-[#121b22] focus:outline-none cursor-pointer`}
                              >
                                <option value="pending">⏳ Pendiente</option>
                                <option value="confirmed">✅ Confirmado</option>
                                <option value="preparing">👨‍🍳 En Preparación</option>
                                <option value="delivering">🛵 En Camino</option>
                                <option value="delivered">🎉 Entregado</option>
                                <option value="cancelled">❌ Cancelado</option>
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="p-5 border-b border-[#1f2c34]">
                  <h3 className="font-bold text-white text-base mb-3">Historial del flujo</h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Flujo actual: <span className="text-slate-400">Menú Principal</span>
                    {conversations.find(c => c.id === selectedConvId)?.status === "human" && (
                      <span className="text-slate-400"> (Interrumpido)</span>
                    )}
                  </p>
                </div>

                <div className="p-5">
                  <h3 className="font-bold text-white text-base mb-4">Acciones Rápidas</h3>
                  <div className="space-y-2.5">
                    {/* Botón Cerrar Caso */}
                    <button
                      onClick={() => handleToggleBot(selectedConvId, "closed")}
                      className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-200 hover:text-white text-sm py-2.5 rounded-lg border border-[#2a3942] transition shadow-sm font-medium"
                    >
                      <i className="ph-bold ph-check-circle text-base text-emerald-400"></i> Cerrar Caso
                    </button>

                    {/* Botón Pausar / Activar Bot */}
                    {conversations.find(c => c.id === selectedConvId)?.status === "bot" ? (
                      <button
                        onClick={() => handleToggleBot(selectedConvId, "human")}
                        className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-200 hover:text-white text-sm py-2.5 rounded-lg border border-[#2a3942] transition shadow-sm font-medium"
                      >
                        <i className="ph-fill ph-pause text-base text-amber-400"></i> Pausar Bot (Asignar Asesor)
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleBot(selectedConvId, "bot")}
                        className="w-full flex items-center justify-center gap-2 bg-[#007aff]/15 hover:bg-[#007aff]/25 text-[#007aff] hover:text-[#3894ff] text-sm py-2.5 rounded-lg border border-[#007aff]/30 transition shadow-sm font-medium"
                      >
                        <i className="ph-fill ph-play text-base"></i> Activar Bot Automático
                      </button>
                    )}

                    {/* Botón Reiniciar Bot */}
                    <button
                      onClick={() => handleToggleBot(selectedConvId, "bot")}
                      className="w-full flex items-center justify-center gap-2 bg-[#202c33] hover:bg-[#2a3942] text-slate-300 hover:text-white text-xs py-2 rounded-lg border border-[#2a3942] transition"
                    >
                      <i className="ph-bold ph-arrows-clockwise text-sm text-emerald-400"></i> Reiniciar Bot
                    </button>

                    {/* Botón Eliminar Conversación */}
                    <div className="pt-3 border-t border-[#1f2c34] mt-3">
                      <button
                        onClick={() => handleDeleteConversation(selectedConvId)}
                        className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 text-xs py-2.5 rounded-lg border border-red-500/20 transition font-medium"
                      >
                        <i className="ph-bold ph-trash text-sm"></i> Eliminar Conversación
                      </button>
                      <p className="text-[10px] text-slate-500 text-center mt-1">
                        Sincroniza el borrado en el panel y en WhatsApp
                      </p>
                    </div>
                  </div>
                </div>

              </aside>
            )}
          </>
        )}

        {/* CONTENEDOR PARA OTRAS TABS */}
        {tab !== "chats" && (
          <main className="flex-1 overflow-y-auto bg-[#0b141a]">
            {tab === "orders" && <DashboardView conversations={conversations} orders={orders} />}
            {tab === "real_orders" && <OrdersView orders={orders} onOrdersChange={loadOrders} />}
            {tab === "catalog" && <CatalogView />}
            {tab === "hours" && <HoursView />}
            {tab === "settings" && <SettingsView />}
            {tab === ("qr" as any) && <div className="text-white p-4">QR / Vincular - En desarrollo</div>}
          </main>
        )}
        
        </div>

      </div>
    </>
  );

}
