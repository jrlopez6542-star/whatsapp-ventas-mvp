"use client";
import React from "react";

export function DashboardView({ conversations = [], orders = [] }: { conversations: any[], orders: any[] }) {
  const totalChats = conversations.length;
  const humanChats = conversations.filter(c => c.status === "human").length;
  const botChats = totalChats - humanChats;
  const botRate = totalChats > 0 ? Math.round((botChats / totalChats) * 100) : 0;
  
  return (
    <div className="p-6 text-slate-300 w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Métricas y Salud del Sistema</h1>
          <p className="text-sm text-slate-400">Resumen ejecutivo en tiempo real del bot y asesores.</p>
        </div>
        <button className="bg-[#202c33] hover:bg-[#2a3942] text-slate-300 px-4 py-2 rounded-lg border border-[#2a3942] transition flex items-center gap-2">
          <i className="ph ph-download-simple"></i> Exportar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-chats-teardrop"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Chats Totales del Día</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{totalChats}</span>
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-robot"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Tasa de Resolución (Bot)</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{botRate}%</span>
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-hand-waving"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Intervenciones Humanas</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{humanChats}</span>
            <span className="text-slate-500 text-sm mb-1">({totalChats > 0 ? Math.round((humanChats/totalChats)*100) : 0}%)</span>
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-receipt"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Pedidos Cerrados</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">{orders.length}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#121b22] border border-[#1f2c34] p-6 rounded-xl">
          <h3 className="font-bold text-white mb-6">Volumen de Mensajes por Hora (Actividad reciente)</h3>
          <div className="h-48 flex items-end justify-between gap-2 border-b border-[#1f2c34]/50 pb-2">
            {/* Mocked activity graph since we don't track message timestamps specifically here */}
            {[10, 25, 45, 80, 100, 65, 40, 20, 15, 35, 50, 20].map((h, i) => (
              <div key={i} className="w-full flex flex-col items-center gap-2 group cursor-pointer">
                <div className="w-full bg-[#007aff]/20 hover:bg-[#007aff]/40 rounded-t-sm relative transition" style={{height: `${h}%`}}></div>
                <span className="text-[10px] text-slate-500">{i+8}h</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-6 rounded-xl">
          <h3 className="font-bold text-white mb-6">Top Intenciones (Aproximación)</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Hablar con Humano</span>
                <span className="text-white font-bold">{totalChats > 0 ? Math.round((humanChats/totalChats)*100) : 0}%</span>
              </div>
              <div className="w-full bg-[#202c33] rounded-full h-2">
                <div className="bg-[#007aff] h-2 rounded-full" style={{width: `${totalChats > 0 ? Math.round((humanChats/totalChats)*100) : 0}%`}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Resuelto por Bot</span>
                <span className="text-white font-bold">{botRate}%</span>
              </div>
              <div className="w-full bg-[#202c33] rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{width: `${botRate}%`}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
