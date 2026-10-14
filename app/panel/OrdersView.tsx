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

  const handleNotifyDriver = async (order: OrderItemView) => {
    setNotifyingDriverId(order.id);
    try {
      const res = await fetch(`/api/panel/orders/${order.id}/notify-driver`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        alert(`¡Ficha de entrega enviada con éxito al WhatsApp del domiciliario (${data.sentTo})! 🛵💨`);
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

  const deleteOrder = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer."))
      return;
    try {
      const res = await fetch(`/api/panel/orders/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (selectedOrder?.id === id) setSelectedOrder(null);
        if (onOrdersChange) onOrdersChange();
      } else {
        alert("Error al eliminar el pedido.");
      }
    } catch {
      alert("Error de conexión al eliminar el pedido.");
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
      if (res.ok) {
        if (onOrdersChange) onOrdersChange();
        if (selectedOrder && selectedOrder.id === id) {
          setSelectedOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
      } else {
        alert("No se pudo actualizar el estado del pedido.");
      }
    } catch {
      alert("Error de conexión al actualizar el estado.");
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto relative">
      <div className="flex justify-between items-center mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-package text-[#007aff]"></i> Gestión de Pedidos
          </h1>
          <p className="text-sm text-slate-400">
            Control de pedidos en tiempo real con notificaciones automáticas por WhatsApp a cada cambio de estado.
          </p>
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="bg-[#162128] hover:bg-[#202c33] text-slate-200 hover:text-white px-3.5 py-2 rounded-lg border border-[#2a3942] transition flex items-center gap-2 text-xs font-semibold shadow-sm shrink-0"
            title="Refrescar pedidos ahora"
          >
            <i className={`ph-bold ph-arrows-clockwise text-sm ${isRefreshing ? 'animate-spin text-[#007aff]' : ''}`}></i>
            <span>{isRefreshing ? 'Actualizando...' : 'Refrescar Pedidos'}</span>
          </button>
        )}
      </div>

      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden shadow-sm">
        {orders.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <i className="ph ph-receipt text-6xl mb-4 text-[#1f2c34]"></i>
            <p className="font-semibold text-lg text-slate-300">No hay pedidos confirmados todavía.</p>
            <p className="text-sm mt-2">
              Cuando un cliente confirme por WhatsApp con su dirección, aparecerá aquí inmediatamente.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-[#1f2c34] text-xs uppercase text-slate-500 bg-[#162128]">
                  <th className="p-4 font-semibold">ID</th>
                  <th className="p-4 font-semibold">Cliente / Teléfono</th>
                  <th className="p-4 font-semibold">Productos</th>
                  <th className="p-4 font-semibold">Dirección de Entrega</th>
                  <th className="p-4 font-semibold">Pago / Cambio</th>
                  <th className="p-4 font-semibold">Total (COP)</th>
                  <th className="p-4 font-semibold">Estado (Notifica WhatsApp)</th>
                  <th className="p-4 font-semibold">Fecha</th>
                  <th className="p-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2c34]">
                {orders.map((o) => {
                  const cfg = STATUS_CONFIG[o.status] || STATUS_CONFIG.confirmed;
                  const isBusy = updatingId === o.id;

                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-[#162128] transition cursor-pointer"
                      onClick={() => setSelectedOrder(o)}
                    >
                      <td className="p-4">
                        <div className="font-mono font-bold text-[#007aff]">#{o.id.slice(0, 8)}</div>
                        {o.invoiceNumber && (
                          <a
                            href={
                              o.invoiceUrl ||
                              `https://contabilidad-app-fawn.vercel.app/invoices/${o.invoiceId || ""}`
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                            title="Abrir factura oficial en Buñuelandia Contabilidad"
                          >
                            <i className="ph-fill ph-receipt text-xs"></i>
                            <span>Factura {o.invoiceNumber}</span>
                            <i className="ph ph-arrow-square-out text-[10px]"></i>
                          </a>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-white">{o.customerName || "Sin Nombre"}</div>
                        <div className="text-xs text-slate-500">
                          {o.phone || o.conversationId.replace(/^whatsapp:/, "").split("@")[0]}
                        </div>
                      </td>
                      <td
                        className="p-4 text-slate-400 max-w-[200px] truncate"
                        title={o.itemsSummary}
                      >
                        {o.itemsSummary}
                      </td>
                      <td
                        className="p-4 text-slate-300 max-w-[220px]"
                        title={o.deliveryAddress}
                      >
                        <div className="truncate font-medium">{o.deliveryAddress || "N/A"}</div>
                        {o.deliveryNotes && (
                          <div className="text-xs text-amber-400/90 truncate flex items-center gap-1 mt-0.5">
                            <i className="ph-fill ph-note text-[11px]"></i> {o.deliveryNotes}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-slate-300">
                        <span className="font-medium">{o.paymentMethod || "N/A"}</span>
                        {o.changeAmount && (
                          <div className="text-xs text-emerald-400 font-mono mt-0.5">
                            💵 {o.changeAmount}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-emerald-400 text-base">
                          ${o.total?.toLocaleString("es-CO")}
                        </div>
                        {o.deliveryFee ? (
                          <div className="text-[11px] text-slate-400">
                            +${o.deliveryFee.toLocaleString("es-CO")} envío
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-500/80">Envío gratis</div>
                        )}
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <select
                            disabled={isBusy}
                            value={o.status || "confirmed"}
                            onChange={(e) => handleStatusChange(o.id, e.target.value)}
                            className={`${cfg.bg} ${cfg.text} ${cfg.border} border text-xs font-semibold rounded-lg px-2.5 py-1.5 outline-none cursor-pointer hover:brightness-110 transition disabled:opacity-50`}
                          >
                            <option value="pending" className="bg-[#121b22] text-amber-400">
                              ⏳ Pendiente
                            </option>
                            <option value="confirmed" className="bg-[#121b22] text-blue-400">
                              👍 Confirmado
                            </option>
                            <option value="preparing" className="bg-[#121b22] text-orange-400">
                              👨‍🍳 En Preparación
                            </option>
                            <option value="delivering" className="bg-[#121b22] text-indigo-400">
                              🛵 En Camino
                            </option>
                            <option value="delivered" className="bg-[#121b22] text-emerald-400">
                              ✅ Entregado
                            </option>
                            <option value="cancelled" className="bg-[#121b22] text-red-400">
                              ❌ Cancelado
                            </option>
                          </select>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 text-xs">
                        {formatOrderDateTime(o.createdAt)}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleNotifyDriver(o);
                          }}
                          disabled={notifyingDriverId === o.id}
                          className="text-emerald-400 hover:text-emerald-300 transition p-2 rounded-md hover:bg-emerald-500/10 mr-1 disabled:opacity-50"
                          title="Enviar ficha de entrega al domiciliario por WhatsApp"
                        >
                          <i className="ph-fill ph-moped text-lg"></i>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteOrder(o.id);
                          }}
                          className="text-slate-500 hover:text-red-500 transition p-2 rounded-md hover:bg-red-500/10"
                          title="Eliminar pedido"
                        >
                          <i className="ph ph-trash text-lg"></i>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLES DEL PEDIDO */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-[#1f2c34] flex justify-between items-center bg-[#162128] rounded-t-xl">
              <h3 className="font-bold text-white text-lg flex items-center gap-2">
                <i className="ph-fill ph-receipt text-[#007aff]"></i> Detalle del Pedido
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <i className="ph ph-x text-xl"></i>
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              {/* ESTADO CON NOTIFICACIÓN POR WHATSAPP */}
              <div className="bg-[#162128] border border-[#2a3942] p-4 rounded-xl">
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <i className="ph-fill ph-bell-ringing text-[#007aff]"></i> ESTADO Y NOTIFICACIÓN WHATSAPP
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={selectedOrder.status}
                    onChange={(e) => handleStatusChange(selectedOrder.id, e.target.value)}
                    className="flex-1 bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white text-sm font-semibold rounded-lg px-3 py-2 outline-none cursor-pointer"
                  >
                    <option value="pending">⏳ Pendiente</option>
                    <option value="confirmed">👍 Confirmado</option>
                    <option value="preparing">👨‍🍳 En Preparación (Notifica al cliente)</option>
                    <option value="delivering">🛵 En Camino (Notifica al domiciliario/cliente)</option>
                    <option value="delivered">✅ Entregado (Mensaje de buen provecho)</option>
                    <option value="cancelled">❌ Cancelado (Aviso de cancelación)</option>
                  </select>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  📲 Al cambiar el estado, el cliente recibe un mensaje automático al instante en su WhatsApp.
                </p>
              </div>

              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-slate-500 mb-1">ID DEL PEDIDO</div>
                  <div className="font-mono text-[#007aff] font-bold">#{selectedOrder.id}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedOrder.invoiceNumber && (
                      <a
                        href={
                          selectedOrder.invoiceUrl ||
                          `https://contabilidad-app-fawn.vercel.app/invoices/${selectedOrder.invoiceId || ""}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition cursor-pointer"
                      >
                        <i className="ph-fill ph-receipt text-sm"></i>
                        <span>Factura #{selectedOrder.invoiceNumber}</span>
                        <i className="ph ph-arrow-square-out text-xs"></i>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => handleNotifyDriver(selectedOrder)}
                      disabled={notifyingDriverId === selectedOrder.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition cursor-pointer disabled:opacity-50"
                      title="Enviar ficha de entrega con dirección y cobro al domiciliario por WhatsApp"
                    >
                      <i className="ph-fill ph-moped text-sm"></i>
                      <span>
                        {notifyingDriverId === selectedOrder.id
                          ? "Enviando..."
                          : "🛵 Enviar al Domiciliario"}
                      </span>
                    </button>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1">FECHA Y HORA</div>
                  <div className="text-sm text-slate-300">
                    {formatOrderDateTime(selectedOrder.createdAt)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#1f2c34]">
                <div>
                  <div className="text-xs text-slate-500 mb-1">CLIENTE</div>
                  <div className="text-sm font-medium text-white">
                    {selectedOrder.customerName || "No especificado"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">TELÉFONO</div>
                  <div className="text-sm font-medium text-white">
                    {selectedOrder.phone ||
                      selectedOrder.conversationId.replace(/^whatsapp:/, "").split("@")[0]}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#1f2c34]">
                <div className="text-xs text-slate-500 mb-1">DIRECCIÓN DE ENTREGA</div>
                <div className="text-sm text-slate-200 bg-[#162128] p-3 rounded-lg border border-[#1f2c34]">
                  {selectedOrder.deliveryAddress || "No especificada"}
                </div>
                {selectedOrder.deliveryNotes && (
                  <div className="mt-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg flex items-start gap-2">
                    <i className="ph-fill ph-info text-base mt-0.5"></i>
                    <div>
                      <span className="font-semibold">Notas de entrega:</span> {selectedOrder.deliveryNotes}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-[#1f2c34]">
                <div>
                  <div className="text-xs text-slate-500 mb-1">MÉTODO DE PAGO</div>
                  <div className="text-sm font-medium text-white">
                    {selectedOrder.paymentMethod || "No especificado"}
                  </div>
                </div>
                {selectedOrder.changeAmount && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">CAMBIO SOLICITADO</div>
                    <div className="text-sm font-semibold text-emerald-400">
                      💵 {selectedOrder.changeAmount}
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#1f2c34]">
                <div className="text-xs text-slate-500 mb-2">PRODUCTOS / RESUMEN</div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap bg-[#162128] p-3 rounded-lg border border-[#1f2c34] leading-relaxed">
                  {selectedOrder.itemsSummary || "No hay detalle de productos"}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#1f2c34] bg-[#162128] rounded-b-xl flex justify-between items-center">
              <div>
                <span className="text-slate-400 font-medium block text-xs">TOTAL A PAGAR</span>
                {selectedOrder.deliveryFee ? (
                  <span className="text-xs text-slate-500">
                    Incluye +${selectedOrder.deliveryFee.toLocaleString("es-CO")} de domicilio
                  </span>
                ) : null}
              </div>
              <span className="text-2xl font-bold text-emerald-500">
                ${selectedOrder.total?.toLocaleString("es-CO")}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
