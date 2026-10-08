"use client";
import React, { useState } from "react";

export function OrdersView({ orders = [], onOrdersChange }: { orders: any[], onOrdersChange?: () => void }) {
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteOrder = async (id: string) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este pedido? Esta acción no se puede deshacer.")) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/panel/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (onOrdersChange) onOrdersChange();
      } else {
        alert("Error al eliminar el pedido.");
      }
    } catch (err) {
      alert("Error de conexión al eliminar el pedido.");
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto relative">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-package text-[#007aff]"></i> Pedidos Confirmados
          </h1>
          <p className="text-sm text-slate-400">
            Aquí se registran automáticamente los pedidos cerrados por la IA con dirección y medio de pago.
          </p>
        </div>
      </div>

      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden shadow-sm">
        {orders.length === 0 ? (
          <div className="text-center py-16 text-slate-500">
            <i className="ph ph-receipt text-6xl mb-4 text-[#1f2c34]"></i>
            <p className="font-semibold text-lg text-slate-300">No hay pedidos confirmados todavía.</p>
            <p className="text-sm mt-2">Cuando un cliente confirme por WhatsApp con su dirección, aparecerá aquí inmediatamente.</p>
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
                  <th className="p-4 font-semibold">Pago</th>
                  <th className="p-4 font-semibold">Total (COP)</th>
                  <th className="p-4 font-semibold">Estado</th>
                  <th className="p-4 font-semibold">Fecha</th>
                    <th className="p-4 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2c34]">
                {orders.map((o) => (
                  <tr 
                    key={o.id} 
                    className="hover:bg-[#162128] transition cursor-pointer"
                    onClick={() => setSelectedOrder(o)}
                  >
                    <td className="p-4 font-mono font-bold text-[#007aff]">#{o.id.slice(0, 8)}</td>
                    <td className="p-4">
                      <div className="font-medium text-white">{o.customerName || "Sin Nombre"}</div>
                      <div className="text-xs text-slate-500">{o.phone || o.conversationId.split('@')[0]}</div>
                    </td>
                    <td className="p-4 text-slate-400 max-w-[200px] truncate" title={o.itemsSummary}>{o.itemsSummary}</td>
                    <td className="p-4 text-slate-400 max-w-[200px] truncate" title={o.deliveryAddress}>{o.deliveryAddress || "N/A"}</td>
                    <td className="p-4 text-slate-400">{o.paymentMethod || "N/A"}</td>
                    <td className="p-4 font-medium text-emerald-500">${o.total?.toLocaleString("es-CO")}</td>
                    <td className="p-4">
                      <span className="bg-amber-500/10 text-amber-500 border border-amber-500/20 px-2 py-1 rounded text-xs font-medium">
                        {o.status === "pending" ? "Pendiente" : o.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-500 text-xs">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                    <td className="p-4 text-right">
                      <button 
                        onClick={(e) => { e.stopPropagation(); deleteOrder(o.id); }}
                        className="text-slate-500 hover:text-red-500 transition p-2 rounded-md hover:bg-red-500/10"
                        title="Eliminar pedido"
                      >
                        <i className="ph ph-trash text-lg"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DETALLES DEL PEDIDO */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/60 z-[99999] flex items-center justify-center p-4">
          <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl w-full max-w-lg shadow-2xl flex flex-col">
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
            
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-xs text-slate-500 mb-1">ID DEL PEDIDO</div>
                  <div className="font-mono text-[#007aff] font-bold">#{selectedOrder.id}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 mb-1">FECHA Y HORA</div>
                  <div className="text-sm text-slate-300">{new Date(selectedOrder.createdAt).toLocaleString()}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#1f2c34]">
                <div>
                  <div className="text-xs text-slate-500 mb-1">CLIENTE</div>
                  <div className="text-sm font-medium text-white">{selectedOrder.customerName || "No especificado"}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">TELÉFONO</div>
                  <div className="text-sm font-medium text-white">{selectedOrder.phone || selectedOrder.conversationId.split('@')[0]}</div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#1f2c34]">
                <div className="text-xs text-slate-500 mb-2">DIRECCIÓN DE ENTREGA</div>
                <div className="text-sm text-slate-300 bg-[#162128] p-3 rounded-lg border border-[#1f2c34]">{selectedOrder.deliveryAddress || "No especificada"}</div>
              </div>

              <div className="pt-4 border-t border-[#1f2c34]">
                <div className="text-xs text-slate-500 mb-2">MÉTODO DE PAGO</div>
                <div className="text-sm font-medium text-white">{selectedOrder.paymentMethod || "No especificado"}</div>
              </div>

              <div className="pt-4 border-t border-[#1f2c34]">
                <div className="text-xs text-slate-500 mb-2">PRODUCTOS / RESUMEN</div>
                <div className="text-sm text-slate-300 whitespace-pre-wrap bg-[#162128] p-3 rounded-lg border border-[#1f2c34] leading-relaxed">
                  {selectedOrder.itemsSummary || "No hay detalle de productos"}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#1f2c34] bg-[#162128] rounded-b-xl flex justify-between items-center">
              <span className="text-slate-400 font-medium">TOTAL A PAGAR</span>
              <span className="text-2xl font-bold text-emerald-500">${selectedOrder.total?.toLocaleString("es-CO")}</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
