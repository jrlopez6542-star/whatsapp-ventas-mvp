"use client";
import React, { useState } from "react";
import { formatOrderDateTime } from "@/lib/date-utils";

interface OrderItemView {
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
  invoiceNumber?: string;
  invoiceId?: string;
  invoiceUrl?: string;
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
  ready: {
    label: "Listo para Despacho",
    bg: "bg-teal-500/10",
    text: "text-teal-400",
    border: "border-teal-500/20",
    icon: "ph-package",
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

export function OrdersView({
  orders = [],
  onOrdersChange,
  onRefresh,
  isRefreshing,
}: {
  orders: OrderItemView[];
  onOrdersChange?: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}) {
  const [selectedOrder, setSelectedOrder] = useState<OrderItemView | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [notifyingDriverId, setNotifyingDriverId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(() => new Set());
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  const handleNotifyDriver = async (order: OrderItemView) => {
    // Verificación preventiva: pedidos en pending, confirmed o preparing no deben notificarse
    const isPremature =
      order.status === "pending" ||
      order.status === "confirmed" ||
      order.status === "preparing";

    if (isPremature) {
      alert(
        `⚠️ El pedido #${order.id.slice(0, 8)} está en estado '${STATUS_CONFIG[order.status]?.label || order.status}'. Debe marcarse como 'Listo para despacho' (ready) antes de notificar al domiciliario.`
      );
      return;
    }

    setNotifyingDriverId(order.id);
    try {
      const res = await fetch(`/api/panel/orders/${order.id}/notify-driver`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        if (data.skipped === "duplicate") {
          if (
            confirm(
              "ℹ️ La ficha de entrega ya fue enviada previamente al domiciliario.\n\n¿Deseas reenviarla forzosamente como reintento?"
            )
          ) {
            const retryRes = await fetch(`/api/panel/orders/${order.id}/notify-driver?force=true`, {
              method: "POST",
            });
            const retryData = await retryRes.json();
            if (retryData.ok) {
              alert(`¡Ficha de entrega reenviada exitosamente (${retryData.sentTo})! 🛵💨`);
            } else {
              alert("Error en reenvío: " + (retryData.error || "Error desconocido"));
            }
          }
        } else {
          alert(`¡Ficha de entrega enviada con éxito al WhatsApp del domiciliario (${data.sentTo})! 🛵💨`);
        }
      } else if (data.premature) {
        alert(`⚠️ ${data.error}`);
      } else if (data.noPhoneConfigured) {
        if (
          confirm(
            "No has configurado el WhatsApp del domiciliario en Ajustes.\n\n¿Deseas abrir WhatsApp para enviárselo manualmente a cualquier contacto?"
          )
        ) {
          window.open(data.waLink, "_blank");
        }
      } else {
        alert("Error al enviar al domiciliario: " + (data.error || "Error desconocido"));
      }
    } catch {
      alert("Error de conexión al notificar al domiciliario.");
    } finally {
      setNotifyingDriverId(null);
    }
  };

  const deleteOrder = async (
    id: string,
    options: { confirmBeforeDelete?: boolean; refreshAfterDelete?: boolean; showError?: boolean } = {}
  ): Promise<boolean> => {
    if (
      options.confirmBeforeDelete !== false &&
      !confirm("¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer.")
    ) {
      return false;
    }
    try {
      const res = await fetch(`/api/panel/orders/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedOrder?.id === id) setSelectedOrder(null);
        setSelectedOrderIds((current) => {
          if (!current.has(id)) return current;
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        if (options.refreshAfterDelete !== false) onOrdersChange?.();
        return true;
      } else {
        if (options.showError !== false) alert("Error al eliminar el pedido.");
        return false;
      }
    } catch {
      if (options.showError !== false) alert("Error de conexión al eliminar el pedido.");
      return false;
    }
  };

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase();
  const visibleOrders = orders.filter((order) => {
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    const method = order.paymentMethod?.trim() || "";
    const matchesPayment = paymentFilter === "all" || method === paymentFilter;
    const searchable = [
      order.id,
      order.customerName,
      order.phone,
      order.conversationId,
      order.itemsSummary,
      order.deliveryAddress,
      order.paymentMethod,
      order.invoiceNumber,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    return matchesStatus && matchesPayment && (!normalizedSearch || searchable.includes(normalizedSearch));
  });
  const paymentMethods = Array.from(new Set(orders.map((order) => order.paymentMethod?.trim()).filter(Boolean))).sort(
    (a, b) => a!.localeCompare(b!, "es")
  ) as string[];
  const selectedCount = orders.filter((order) => selectedOrderIds.has(order.id)).length;
  const allVisibleSelected = visibleOrders.length > 0 && visibleOrders.every((order) => selectedOrderIds.has(order.id));

  const toggleOrderSelection = (id: string) => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleVisibleOrderSelection = () => {
    setSelectedOrderIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleOrders.forEach((order) => next.delete(order.id));
      else visibleOrders.forEach((order) => next.add(order.id));
      return next;
    });
  };

  const deleteSelectedOrders = async () => {
    const ids = orders.filter((order) => selectedOrderIds.has(order.id)).map((order) => order.id);
    if (ids.length === 0 || isDeletingSelected) return;
    if (!confirm(`Vas a eliminar ${ids.length} pedido${ids.length === 1 ? "" : "s"} seleccionado${ids.length === 1 ? "" : "s"}. Esta acción no se puede deshacer. ¿Deseas continuar?`)) {
      return;
    }

    setIsDeletingSelected(true);
    const deletedIds: string[] = [];
    const failedIds: string[] = [];
    try {
      for (const id of ids) {
        const deleted = await deleteOrder(id, {
          confirmBeforeDelete: false,
          refreshAfterDelete: false,
          showError: false,
        });
        (deleted ? deletedIds : failedIds).push(id);
      }

      if (deletedIds.length > 0) {
        setSelectedOrderIds((current) => {
          const next = new Set(current);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
        if (selectedOrder && deletedIds.includes(selectedOrder.id)) setSelectedOrder(null);
        onOrdersChange?.();
      }

      if (failedIds.length > 0) {
        const failedList = failedIds.slice(0, 5).map((id) => `#${id.slice(0, 8)}`).join(", ");
        const remaining = failedIds.length > 5 ? ` y ${failedIds.length - 5} más` : "";
        alert(
          `${deletedIds.length} pedido${deletedIds.length === 1 ? "" : "s"} eliminado${deletedIds.length === 1 ? "" : "s"}. No se pudieron eliminar ${failedIds.length}: ${failedList}${remaining}.`
        );
      } else {
        alert(`Se eliminaron ${deletedIds.length} pedido${deletedIds.length === 1 ? "" : "s"} seleccionado${deletedIds.length === 1 ? "" : "s"}.`);
      }
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/panel/orders/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, notifyCustomer: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (onOrdersChange) onOrdersChange();
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
        if (data.warning) {
          alert(data.warning);
        }
      } else {
        alert(data.error || "No se pudo actualizar el estado del pedido.");
      }
    } catch {
      alert("Error de conexión al actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  };

  const summaryCards = [
    {
      label: "Pedidos registrados",
      value: orders.length,
      icon: "ph-receipt",
      tone: "text-sky-300 bg-sky-400/10",
      detail: "En el listado actual",
    },
    {
      label: "Pendientes",
      value: orders.filter((order) => order.status === "pending").length,
      icon: "ph-clock-countdown",
      tone: "text-amber-300 bg-amber-400/10",
      detail: "Requieren seguimiento",
    },
    {
      label: "En preparación",
      value: orders.filter((order) => order.status === "preparing").length,
      icon: "ph-cooking-pot",
      tone: "text-orange-300 bg-orange-400/10",
      detail: "En proceso de cocina",
    },
    {
      label: "Valor de pedidos",
      value: `$${orders.reduce((sum, order) => sum + (order.total || 0), 0).toLocaleString("es-CO")}`,
      icon: "ph-currency-circle-dollar",
      tone: "text-emerald-300 bg-emerald-400/10",
      detail: "Suma del listado actual",
    },
  ];

  return (
    <div className="relative h-full w-full overflow-y-auto p-4 pt-16 text-slate-300 md:p-7 md:pt-7">
      <div className="mx-auto w-full max-w-[1600px]">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">Operación · Buñuelandia</p>
            <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-white md:text-3xl">
              <i className="ph-fill ph-package text-emerald-400"></i> Pedidos
            </h1>
            <p className="max-w-2xl text-sm text-slate-400">
              Revisa el avance, los datos de entrega y el valor de cada pedido desde un solo lugar.
            </p>
          </div>
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="flex shrink-0 items-center gap-2 rounded-lg border border-[#2a3942] bg-[#162128] px-3.5 py-2.5 text-xs font-semibold text-slate-200 shadow-sm transition hover:bg-[#202c33] hover:text-white disabled:opacity-60"
              title="Refrescar pedidos ahora"
            >
              <i className={`ph-bold ph-arrows-clockwise text-sm ${isRefreshing ? "animate-spin text-emerald-300" : ""}`}></i>
              <span>{isRefreshing ? "Actualizando..." : "Actualizar"}</span>
            </button>
          )}
        </div>

        <section aria-label="Resumen de pedidos" className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <article key={card.label} className="rounded-xl border border-[#26343c] bg-[#121b22] p-4 shadow-sm md:p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-400">{card.label}</p>
                  <p className="mt-2 truncate text-xl font-bold tracking-tight text-white md:text-2xl">{card.value}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.tone}`}>
                  <i className={`ph-fill ${card.icon} text-xl`}></i>
                </span>
              </div>
              <p className="mt-3 text-[11px] text-slate-500">{card.detail}</p>
            </article>
          ))}
        </section>

        <section className="overflow-hidden rounded-xl border border-[#26343c] bg-[#121b22] shadow-sm" aria-label="Listado de pedidos">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1f2c34] px-4 py-4 md:px-5">
            <div>
              <h2 className="text-sm font-semibold text-white">Todos los pedidos</h2>
              <p className="mt-0.5 text-xs text-slate-500">{visibleOrders.length} de {orders.length} pedidos · selecciona uno para ver el detalle</p>
            </div>
            <span className="rounded-full border border-[#2a3942] bg-[#0b141a] px-2.5 py-1 text-[11px] font-medium text-slate-400">Tiempo real</span>
          </div>

          {orders.length > 0 && (
            <div className="space-y-3 border-b border-[#1f2c34] bg-[#10191f] px-3 py-3 md:px-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(220px,1fr)_180px_180px]">
                <label className="relative block">
                  <span className="sr-only">Buscar pedidos</span>
                  <i className="ph ph-magnifying-glass pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"></i>
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Buscar cliente, teléfono, ID o producto"
                    className="w-full rounded-lg border border-[#2a3942] bg-[#0b141a] py-2 pl-9 pr-3 text-xs text-slate-200 outline-none placeholder:text-slate-600 focus:border-sky-500"
                  />
                </label>
                <label>
                  <span className="sr-only">Filtrar por estado</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                    className="w-full rounded-lg border border-[#2a3942] bg-[#0b141a] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-500"
                  >
                    <option value="all">Todos los estados</option>
                    {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                      <option key={status} value={status}>{config.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">Filtrar por medio de pago</span>
                  <select
                    value={paymentFilter}
                    onChange={(event) => setPaymentFilter(event.target.value)}
                    className="w-full rounded-lg border border-[#2a3942] bg-[#0b141a] px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-500"
                  >
                    <option value="all">Todos los medios de pago</option>
                    {paymentMethods.map((method) => <option key={method} value={method}>{method}</option>)}
                  </select>
                </label>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleVisibleOrderSelection}
                      disabled={visibleOrders.length === 0 || isDeletingSelected}
                      className="h-4 w-4 rounded border-[#40505a] bg-[#0b141a] accent-emerald-500"
                    />
                    Seleccionar {visibleOrders.length === orders.length ? "todos" : `los ${visibleOrders.length} visibles`}
                  </label>
                  <span aria-live="polite" className="text-xs font-medium text-slate-400">
                    {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={deleteSelectedOrders}
                  disabled={selectedCount === 0 || isDeletingSelected}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className={`ph ph-trash ${isDeletingSelected ? "animate-pulse" : ""}`}></i>
                  {isDeletingSelected ? "Eliminando..." : "Eliminar seleccionados"}
                </button>
              </div>
            </div>
          )}

          {orders.length === 0 ? (
            <div className="px-5 py-16 text-center text-slate-500">
              <i className="ph ph-receipt text-5xl text-[#2a3942]"></i>
              <p className="mt-3 font-semibold text-slate-200">Aún no hay pedidos confirmados</p>
              <p className="mx-auto mt-1 max-w-md text-sm">
                Cuando un cliente confirme por WhatsApp con su dirección, el pedido aparecerá aquí.
              </p>
            </div>
          ) : visibleOrders.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <i className="ph ph-magnifying-glass text-4xl text-[#40505a]"></i>
              <p className="mt-3 text-sm font-semibold text-slate-200">No encontramos pedidos con esos filtros</p>
              <button
                type="button"
                onClick={() => { setSearchTerm(""); setStatusFilter("all"); setPaymentFilter("all"); }}
                className="mt-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
              >
                Limpiar búsqueda y filtros
              </button>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#26343c] bg-[#162128] text-[10px] uppercase tracking-wider text-slate-500">
                      <th className="w-10 px-3 py-3" aria-label="Seleccionar pedido"></th>
                      <th className="px-4 py-3 font-semibold">Cliente</th>
                      <th className="px-4 py-3 font-semibold">Pedido</th>
                      <th className="px-4 py-3 font-semibold">Productos</th>
                      <th className="px-4 py-3 font-semibold">Entrega / pago</th>
                      <th className="px-4 py-3 font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1f2c34]">
                    {visibleOrders.map((o) => {
                      const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.confirmed;
                      const isBusy = updatingId === o.id;

                      return (
                        <tr key={o.id} className="group cursor-pointer transition hover:bg-[#162128]/80" onClick={() => setSelectedOrder(o)}>
                          <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedOrderIds.has(o.id)}
                              onChange={() => toggleOrderSelection(o.id)}
                              disabled={isDeletingSelected}
                              aria-label={`Seleccionar pedido ${o.id.slice(0, 8)}`}
                              className="h-4 w-4 rounded border-[#40505a] bg-[#0b141a] accent-emerald-500"
                            />
                          </td>
                          <td className="max-w-[190px] px-3 py-3">
                            <div className="truncate font-semibold text-slate-100">{o.customerName || "Sin nombre"}</div>
                            <div className="mt-1 truncate text-xs text-slate-500">{o.phone || o.conversationId.replace(/^whatsapp:/, "").split("@")[0]}</div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="font-mono text-xs font-semibold text-sky-300">#{o.id.slice(0, 8)}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{formatOrderDateTime(o.createdAt)}</div>
                            {o.invoiceNumber && (
                              <a
                                href={o.invoiceUrl || `https://contabilidad-app-fawn.vercel.app/invoices/${o.invoiceId || ""}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/20"
                                title="Abrir factura oficial en Buñuelandia Contabilidad"
                              >
                                <i className="ph-fill ph-receipt"></i> Factura {o.invoiceNumber}
                              </a>
                            )}
                          </td>
                          <td className="max-w-[240px] px-3 py-3 leading-relaxed text-slate-400">
                            <div className="line-clamp-2" title={o.itemsSummary}>{o.itemsSummary || "Sin detalle"}</div>
                          </td>
                          <td className="max-w-[210px] px-3 py-3">
                            <div className="truncate text-xs text-slate-200" title={o.deliveryAddress}>{o.deliveryAddress || "Dirección pendiente"}</div>
                            <div className="mt-1 truncate text-[11px] text-slate-500">{o.paymentMethod || "Pago sin especificar"}{o.changeAmount ? ` · Cambio ${o.changeAmount}` : ""}</div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3">
                            <div className="font-semibold text-emerald-300">${o.total?.toLocaleString("es-CO")}</div>
                            <div className="mt-1 text-[10px] text-slate-500">{o.deliveryFee ? `Envío $${o.deliveryFee.toLocaleString("es-CO")}` : "Envío gratis"}</div>
                          </td>
                          <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                            <div className="flex flex-col items-start gap-1.5">
                              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                <i className={`ph-fill ${cfg.icon}`}></i>{cfg.label}
                              </span>
                              <select
                                aria-label={`Cambiar estado del pedido ${o.id.slice(0, 8)}`}
                                disabled={isBusy}
                                value={o.status || "confirmed"}
                                onChange={(e) => handleStatusChange(o.id, e.target.value)}
                                className="max-w-[155px] cursor-pointer rounded-md border border-[#2a3942] bg-[#0b141a] px-2 py-1 text-[10px] text-slate-300 outline-none transition focus:border-sky-500 disabled:opacity-50"
                              >
                                <option value="pending">Pendiente</option>
                                <option value="confirmed">Confirmado</option>
                                <option value="preparing">En preparación</option>
                                <option value="ready">Listo para despacho</option>
                                <option value="delivering">En camino</option>
                                <option value="delivered">Entregado</option>
                                <option value="cancelled">Cancelado</option>
                              </select>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => handleNotifyDriver(o)} disabled={notifyingDriverId === o.id} className="rounded-lg p-2 text-emerald-300 transition hover:bg-emerald-500/10 hover:text-emerald-200 disabled:opacity-50" title="Enviar ficha de entrega al domiciliario por WhatsApp" aria-label="Notificar al domiciliario">
                              <i className="ph-fill ph-moped text-lg"></i>
                            </button>
                            <button onClick={() => deleteOrder(o.id)} className="rounded-lg p-2 text-slate-500 transition hover:bg-red-500/10 hover:text-red-300" title="Eliminar pedido" aria-label="Eliminar pedido">
                              <i className="ph ph-trash text-lg"></i>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 p-3 md:hidden">
                {visibleOrders.map((o) => {
                  const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.confirmed;
                  const isBusy = updatingId === o.id;

                  return (
                    <article key={o.id} className={`rounded-xl border bg-[#0f171d] p-4 ${selectedOrderIds.has(o.id) ? "border-emerald-500/40" : "border-[#26343c]"}`} onClick={() => setSelectedOrder(o)}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.has(o.id)}
                            onChange={() => toggleOrderSelection(o.id)}
                            onClick={(event) => event.stopPropagation()}
                            disabled={isDeletingSelected}
                            aria-label={`Seleccionar pedido ${o.id.slice(0, 8)}`}
                            className="mt-1 h-4 w-4 shrink-0 rounded border-[#40505a] bg-[#0b141a] accent-emerald-500"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-white">{o.customerName || "Sin nombre"}</p>
                            <p className="mt-1 truncate text-xs text-slate-500">{o.phone || o.conversationId.replace(/^whatsapp:/, "").split("@")[0]}</p>
                          </div>
                        </div>
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                          <i className={`ph-fill ${cfg.icon}`}></i>{cfg.label}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-[#1f2c34] pt-3">
                        <div>
                          <p className="font-mono text-xs font-semibold text-sky-300">#{o.id.slice(0, 8)}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{formatOrderDateTime(o.createdAt)}</p>
                        </div>
                        <p className="text-lg font-bold text-emerald-300">${o.total?.toLocaleString("es-CO")}</p>
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-slate-400">{o.itemsSummary || "Sin detalle de productos"}</p>
                      <div className="mt-3 flex items-center gap-2 border-t border-[#1f2c34] pt-3" onClick={(e) => e.stopPropagation()}>
                        <select
                          aria-label={`Cambiar estado del pedido ${o.id.slice(0, 8)}`}
                          disabled={isBusy}
                          value={o.status || "confirmed"}
                          onChange={(e) => handleStatusChange(o.id, e.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-[#2a3942] bg-[#121b22] px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-sky-500 disabled:opacity-50"
                        >
                          <option value="pending">Pendiente</option>
                          <option value="confirmed">Confirmado</option>
                          <option value="preparing">En preparación</option>
                          <option value="ready">Listo para despacho</option>
                          <option value="delivering">En camino</option>
                          <option value="delivered">Entregado</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                        <button onClick={() => handleNotifyDriver(o)} disabled={notifyingDriverId === o.id} className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 text-emerald-300 disabled:opacity-50" title="Notificar al domiciliario" aria-label="Notificar al domiciliario">
                          <i className="ph-fill ph-moped text-lg"></i>
                        </button>
                        <button onClick={() => deleteOrder(o.id)} className="flex h-9 w-10 shrink-0 items-center justify-center rounded-lg border border-[#2a3942] text-slate-400 hover:border-red-500/30 hover:text-red-300" title="Eliminar pedido" aria-label="Eliminar pedido">
                          <i className="ph ph-trash text-lg"></i>
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </div>

      {selectedOrder && (
        <div className="fixed inset-0 z-[99999] flex justify-end" role="presentation" onClick={() => setSelectedOrder(null)}>
          <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"></div>
          <aside role="dialog" aria-modal="true" aria-labelledby="order-detail-title" onClick={(e) => e.stopPropagation()} className="relative flex h-full w-full max-w-xl flex-col border-l border-[#26343c] bg-[#10191f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#26343c] bg-[#121b22] px-5 py-4 md:px-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Resumen del pedido</p>
                <h3 id="order-detail-title" className="mt-1 flex items-center gap-2 text-lg font-bold text-white">
                  <i className="ph-fill ph-receipt text-emerald-300"></i> #{selectedOrder.id.slice(0, 8)}
                </h3>
              </div>
              <button onClick={() => setSelectedOrder(null)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#2a3942] text-slate-400 transition hover:bg-[#202c33] hover:text-white" aria-label="Cerrar detalle">
                <i className="ph ph-x text-lg"></i>
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Total del pedido</p>
                  <p className="mt-1 text-2xl font-bold text-emerald-300">${selectedOrder.total?.toLocaleString("es-CO")}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatOrderDateTime(selectedOrder.createdAt)}</p>
                </div>
                {(() => {
                  const cfg = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.confirmed;
                  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${cfg.bg} ${cfg.text} ${cfg.border}`}><i className={`ph-fill ${cfg.icon}`}></i>{cfg.label}</span>;
                })()}
              </div>

              {/* ESTADO CON NOTIFICACIÓN POR WHATSAPP */}
              <div className="rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                <label className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <i className="ph-fill ph-bell-ringing text-sky-300"></i> Estado y notificación WhatsApp
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                    className="min-w-0 flex-1 cursor-pointer rounded-lg border border-[#2a3942] bg-[#0b141a] px-3 py-2.5 text-sm font-semibold text-white outline-none focus:border-sky-500"
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="confirmed">👍 Confirmado</option>
                    <option value="preparing">👨‍🍳 En Preparación (Notifica al cliente)</option>
                    <option value="ready">📦 Listo para Despacho (Notifica al domiciliario)</option>
                    <option value="delivering">🛵 En Camino (Notifica al cliente)</option>
                    <option value="delivered">✅ Entregado (Mensaje de buen provecho)</option>
                    <option value="cancelled">❌ Cancelado (Aviso de cancelación)</option>
                  </select>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Al cambiar el estado, el cliente recibe automáticamente una notificación en WhatsApp.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Cliente</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-100">{selectedOrder.customerName || "No especificado"}</p>
                  <p className="mt-1 break-all text-xs text-slate-400">{selectedOrder.phone || selectedOrder.conversationId.replace(/^whatsapp:/, "").split("@")[0]}</p>
                </div>
                <div className="rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Pago</p>
                  <p className="mt-1.5 text-sm font-semibold text-slate-100">{selectedOrder.paymentMethod || "No especificado"}</p>
                  {selectedOrder.changeAmount && <p className="mt-1 text-xs text-emerald-300">Cambio: {selectedOrder.changeAmount}</p>}
                </div>
              </div>

              <div className="rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dirección de entrega</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-200">{selectedOrder.deliveryAddress || "No especificada"}</p>
                {selectedOrder.deliveryNotes && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    <i className="ph-fill ph-note mt-0.5"></i><span><strong>Notas:</strong> {selectedOrder.deliveryNotes}</span>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-[#26343c] bg-[#121b22] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Productos / resumen</p>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                  {selectedOrder.itemsSummary || "No hay detalle de productos"}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedOrder.invoiceNumber && (
                  <a href={selectedOrder.invoiceUrl || `https://contabilidad-app-fawn.vercel.app/invoices/${selectedOrder.invoiceId || ""}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20">
                    <i className="ph-fill ph-receipt"></i> Factura #{selectedOrder.invoiceNumber}<i className="ph ph-arrow-square-out"></i>
                  </a>
                )}
                <button type="button" onClick={() => handleNotifyDriver(selectedOrder)} disabled={notifyingDriverId === selectedOrder.id} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/20 disabled:opacity-50" title="Enviar ficha de entrega con dirección y cobro al domiciliario por WhatsApp">
                  <i className="ph-fill ph-moped"></i>{notifyingDriverId === selectedOrder.id ? "Enviando..." : "Enviar al domiciliario"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-[#26343c] bg-[#121b22] px-5 py-4 md:px-6">
              <div><span className="block text-xs font-medium text-slate-400">Total a pagar</span>{selectedOrder.deliveryFee ? <span className="mt-1 block text-[11px] text-slate-500">Incluye ${selectedOrder.deliveryFee.toLocaleString("es-CO")} de domicilio</span> : <span className="mt-1 block text-[11px] text-slate-500">Domicilio gratis</span>}</div>
              <span className="text-2xl font-bold text-emerald-300">${selectedOrder.total?.toLocaleString("es-CO")}</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
