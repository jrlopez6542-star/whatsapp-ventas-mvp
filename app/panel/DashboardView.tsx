"use client";

import React from "react";

export function DashboardView() {
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

      {/* A. Tarjetas de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-chats-teardrop"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Chats Totales del Día</h3>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-white">1,240</span>
            <span className="text-emerald-500 text-sm font-medium flex items-center mb-1"><i className="ph ph-trend-up"></i> 12%</span>
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
            <span className="text-3xl font-bold text-white">78%</span>
            <span className="text-emerald-500 text-sm font-medium flex items-center mb-1"><i className="ph ph-trend-up"></i> 4%</span>
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
            <span className="text-3xl font-bold text-white">272</span>
            <span className="text-slate-500 text-sm mb-1">(22%)</span>
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-5 rounded-xl flex flex-col justify-between">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 text-purple-500 flex items-center justify-center text-xl">
              <i className="ph-fill ph-timer"></i>
            </div>
            <h3 className="text-slate-400 font-medium text-sm">Tiempo de Respuesta</h3>
          </div>
          <div className="flex flex-col mt-1">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500">Bot</span>
              <span className="text-emerald-500 font-medium">&lt; 2 seg</span>
            </div>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-slate-500">Humano</span>
              <span className="text-white font-medium">3m 15s</span>
            </div>
          </div>
        </div>
      </div>

      {/* B. Gráficas Principales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#121b22] border border-[#1f2c34] p-6 rounded-xl">
          <h3 className="font-bold text-white mb-6">Volumen de Mensajes por Hora</h3>
          <div className="h-48 flex items-end justify-between gap-2 border-b border-[#1f2c34]/50 pb-2">
            {[10, 25, 45, 80, 100, 65, 40, 20, 15, 35, 50, 20].map((h, i) => (
              <div key={i} className="w-full flex flex-col items-center gap-2 group cursor-pointer">
                <div className="w-full bg-[#007aff]/20 hover:bg-[#007aff]/40 rounded-t-sm relative transition" style={{height: `${h}%`}}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#202c33] text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition shadow-lg pointer-events-none">
                    {Math.floor(h * 12.4)}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500">{i+8}h</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] p-6 rounded-xl">
          <h3 className="font-bold text-white mb-6">Top Intenciones (Flujos)</h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Consulta de Catálogo</span>
                <span className="text-white font-bold">45%</span>
              </div>
              <div className="w-full bg-[#202c33] rounded-full h-2">
                <div className="bg-[#007aff] h-2 rounded-full" style={{width: '45%'}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Soporte de Pedidos</span>
                <span className="text-white font-bold">30%</span>
              </div>
              <div className="w-full bg-[#202c33] rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{width: '30%'}}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-300">Hablar con Humano</span>
                <span className="text-white font-bold">25%</span>
              </div>
              <div className="w-full bg-[#202c33] rounded-full h-2">
                <div className="bg-amber-500 h-2 rounded-full" style={{width: '25%'}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* C. Tablas de Monitoreo en Vivo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1f2c34] flex justify-between items-center bg-[#162128]">
            <h3 className="font-bold text-white">Estado de Asesores</h3>
            <span className="bg-emerald-500/10 text-emerald-500 text-xs px-2 py-1 rounded font-medium">3 Conectados</span>
          </div>
          <div className="divide-y divide-[#1f2c34]">
            {[
              { name: "Carlos Mendoza", status: "Disponible", color: "text-emerald-500", bg: "bg-emerald-500", chats: 2 },
              { name: "Ana Poveda", status: "Ocupado", color: "text-amber-500", bg: "bg-amber-500", chats: 5 },
              { name: "Luis García", status: "Desconectado", color: "text-slate-500", bg: "bg-slate-500", chats: 0 }
            ].map((a, i) => (
              <div key={i} className="p-4 flex items-center justify-between hover:bg-[#162128] transition">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#202c33] flex items-center justify-center text-slate-300 font-bold">
                    {a.name.charAt(0)}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">{a.name}</h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className={`w-2 h-2 rounded-full ${a.bg}`}></div>
                      <span className={`text-xs ${a.color}`}>{a.status}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-white">{a.chats}</span>
                  <p className="text-[10px] text-slate-500 uppercase">Chats activos</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden">
          <div className="p-5 border-b border-[#1f2c34] flex justify-between items-center bg-[#162128]">
            <h3 className="font-bold text-white flex items-center gap-2">
              <i className="ph-fill ph-warning-circle text-amber-500"></i> Alertas / Fallbacks
            </h3>
            <button className="text-[#007aff] text-sm hover:underline">Ver todo</button>
          </div>
          <div className="divide-y divide-[#1f2c34]">
            {[
              { phone: "+57 300 123 4567", msg: "no entiendo como usar la guia", time: "Hace 2 min" },
              { phone: "+57 320 987 6543", msg: "quiero hablar con un asesor humano ya", time: "Hace 15 min" },
              { phone: "+57 311 555 4444", msg: "donde esta mi pedido asdfg", time: "Hace 1 hora" }
            ].map((err, i) => (
              <div key={i} className="p-4 hover:bg-[#162128] transition">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm font-medium text-slate-300">{err.phone}</span>
                  <span className="text-xs text-slate-500">{err.time}</span>
                </div>
                <div className="bg-[#202c33] border border-[#2a3942] p-2.5 rounded-lg text-sm text-slate-400 font-mono">
                  "{err.msg}"
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button className="text-xs text-slate-400 hover:text-white bg-[#202c33] px-2 py-1 rounded">Auditar</button>
                  <button className="text-xs text-emerald-500 hover:bg-emerald-500/10 px-2 py-1 rounded">Entrenar Bot</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
