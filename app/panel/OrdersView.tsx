"use client";
import React from "react";

export function OrdersView({ orders = [] }: { orders: any[] }) {
  return (
    <div className="p-6 text-slate-300 w-full h-full overflow-y-auto">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1f2c34]">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#162128] transition">
                    <td className="p-4 font-mono font-bold text-[#007aff]">#{o.id.slice(0, 8)}</td>
                    <td className="p-4">
                      <div className="font-medium text-white">{o.customerName || "Sin Nombre"}</div>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
