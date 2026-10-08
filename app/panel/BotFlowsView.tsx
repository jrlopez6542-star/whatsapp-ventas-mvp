"use client";

import React, { useState } from "react";

export function BotFlowsView() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [editingFlow, setEditingFlow] = useState<string | null>(null);

  if (view === "editor") {
    return (
      <div className="flex flex-col h-full w-full bg-[#0b141a]">
        <div className="h-16 border-b border-[#1f2c34] bg-[#121b22] px-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => { setView("list"); setEditingFlow(null); }}
              className="w-8 h-8 rounded hover:bg-[#202c33] flex items-center justify-center text-slate-400 hover:text-white transition"
            >
              <i className="ph ph-arrow-left text-xl"></i>
            </button>
            <div>
              <h2 className="text-white font-bold">{editingFlow}</h2>
              <p className="text-xs text-slate-400">Constructor Visual (Canvas)</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="text-slate-300 hover:text-white px-3 py-1.5 rounded hover:bg-[#202c33] text-sm">
              Descartar
            </button>
            <button className="bg-[#007aff] hover:bg-[#005bb5] text-white px-4 py-1.5 rounded text-sm font-medium transition flex items-center gap-2">
              <i className="ph ph-floppy-disk"></i> Guardar y Publicar
            </button>
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden flex" style={{backgroundImage: 'radial-gradient(#1f2c34 1px, transparent 1px)', backgroundSize: '20px 20px'}}>
          {/* MOCKUP OF VISUAL BUILDER (CANVAS) */}
          <div className="absolute top-10 left-10 w-[300px] bg-[#121b22] border border-[#007aff] rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#007aff]/10 p-3 border-b border-[#1f2c34] flex items-center gap-2">
              <i className="ph-fill ph-lightning text-[#007aff]"></i>
              <h3 className="font-bold text-white text-sm">Disparador (Trigger)</h3>
            </div>
            <div className="p-4 space-y-3">
              <div className="text-xs text-slate-400">Se activa cuando:</div>
              <div className="bg-[#202c33] p-2 rounded text-sm text-slate-300 border border-[#2a3942]">
                Palabra clave: <span className="text-[#007aff] font-mono">"hola", "info"</span>
              </div>
            </div>
            <div className="h-4 flex items-center justify-center">
              <div className="w-1 h-full bg-[#007aff]"></div>
            </div>
          </div>

          <div className="absolute top-[220px] left-10 w-[300px] bg-[#121b22] border border-[#1f2c34] rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#22c55e]/10 p-3 border-b border-[#1f2c34] flex items-center gap-2">
              <i className="ph-fill ph-whatsapp-logo text-[#22c55e]"></i>
              <h3 className="font-bold text-white text-sm">Mensaje WhatsApp</h3>
            </div>
            <div className="p-4 space-y-3">
              <textarea 
                className="w-full bg-[#202c33] text-sm text-white p-3 rounded-lg border border-[#2a3942] focus:border-[#007aff] focus:ring-0 resize-none h-24"
                defaultValue="¡Hola! 👋 Bienvenido a Buñuelandia. ¿Qué deseas hacer hoy?"
              ></textarea>
              <div className="space-y-2">
                <div className="bg-[#202c33] border border-[#2a3942] text-[#53bdeb] text-sm py-2 px-3 rounded flex justify-between items-center cursor-move">
                  <span>Ver Catálogo</span> <i className="ph ph-dots-six-vertical text-slate-500"></i>
                </div>
                <div className="bg-[#202c33] border border-[#2a3942] text-[#53bdeb] text-sm py-2 px-3 rounded flex justify-between items-center cursor-move">
                  <span>Hablar con Asesor</span> <i className="ph ph-dots-six-vertical text-slate-500"></i>
                </div>
                <button className="w-full border border-dashed border-[#2a3942] hover:border-[#007aff] text-slate-400 hover:text-[#007aff] py-2 rounded text-sm transition">
                  + Agregar Botón
                </button>
              </div>
            </div>
          </div>

          <div className="absolute top-[220px] left-[380px] w-[280px] bg-[#121b22] border border-[#1f2c34] rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#f59e0b]/10 p-3 border-b border-[#1f2c34] flex items-center gap-2">
              <i className="ph-fill ph-git-branch text-[#f59e0b]"></i>
              <h3 className="font-bold text-white text-sm">Lógica y Condiciones</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="bg-[#202c33] p-3 rounded border border-[#2a3942] flex items-center gap-2 text-slate-300">
                <span className="text-slate-500">Si elige:</span> Ver Catálogo
              </div>
              <div className="flex justify-center"><i className="ph ph-arrow-down text-slate-500"></i></div>
              <div className="bg-[#202c33] p-3 rounded border border-[#2a3942] flex items-center gap-2 text-slate-300">
                <i className="ph ph-arrow-right text-[#007aff]"></i> Ir a Flujo: Catálogo
              </div>
            </div>
          </div>

          <div className="absolute top-[220px] left-[700px] w-[280px] bg-[#121b22] border border-[#1f2c34] rounded-xl shadow-2xl overflow-hidden">
            <div className="bg-[#a855f7]/10 p-3 border-b border-[#1f2c34] flex items-center gap-2">
              <i className="ph-fill ph-gear-six text-[#a855f7]"></i>
              <h3 className="font-bold text-white text-sm">Acción del Sistema</h3>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="bg-[#202c33] p-3 rounded border border-[#2a3942] flex items-center gap-2 text-slate-300">
                <i className="ph ph-tag text-[#a855f7]"></i> Agregar Tag: <span className="bg-[#1e293b] text-slate-300 px-2 rounded">Soporte</span>
              </div>
              <div className="bg-[#202c33] p-3 rounded border border-[#2a3942] flex items-center gap-2 text-slate-300">
                <i className="ph ph-user text-emerald-500"></i> Asignar a Asesor / Pausar Bot
              </div>
            </div>
          </div>

          {/* SVG Connectors mock */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-[-1]">
            <path d="M 260 216 L 260 220" stroke="#007aff" strokeWidth="2" fill="none" />
            <path d="M 310 350 C 340 350, 350 250, 380 250" stroke="#1f2c34" strokeWidth="2" fill="none" />
            <path d="M 660 350 L 700 350" stroke="#1f2c34" strokeWidth="2" fill="none" />
          </svg>

          {/* Floating Actions Palette */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-[#121b22] border border-[#1f2c34] shadow-2xl rounded-full px-6 py-3 flex gap-4">
            <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition group">
              <div className="w-10 h-10 rounded-full bg-[#202c33] group-hover:bg-[#007aff] flex items-center justify-center text-lg transition">
                <i className="ph-fill ph-whatsapp-logo"></i>
              </div>
              <span className="text-[10px] font-medium">Mensaje</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition group">
              <div className="w-10 h-10 rounded-full bg-[#202c33] group-hover:bg-[#f59e0b] flex items-center justify-center text-lg transition">
                <i className="ph-fill ph-git-branch"></i>
              </div>
              <span className="text-[10px] font-medium">Condición</span>
            </button>
            <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition group">
              <div className="w-10 h-10 rounded-full bg-[#202c33] group-hover:bg-[#a855f7] flex items-center justify-center text-lg transition">
                <i className="ph-fill ph-gear-six"></i>
              </div>
              <span className="text-[10px] font-medium">Acción</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Bot (Flujos de Conversación)</h1>
          <p className="text-sm text-slate-400">Gestiona los árboles de decisión y respuestas automáticas.</p>
        </div>
        <button className="bg-[#007aff] hover:bg-[#005bb5] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 font-medium">
          <i className="ph ph-plus"></i> Crear Nuevo Flujo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* A. Flujos Predeterminados */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4 border-b border-[#1f2c34] pb-2">Flujos Predeterminados</h2>
          <div className="space-y-4">
            {[
              { name: "Flujo de Bienvenida", desc: "Onboarding y Menú Principal", trigger: "Nuevo chat, 'hola', 'menu'", active: true },
              { name: "Fuera de Horario", desc: "Mensaje Out of Office", trigger: "Horario fuera de 8am - 6pm", active: true },
              { name: "Transferencia Humana", desc: "Handover o escalado a asesor", trigger: "Usuario presiona 'Hablar con humano'", active: true },
              { name: "Fallback / No entendido", desc: "El bot no reconoce la intención", trigger: "Intentos fallidos > 2", active: false }
            ].map((f, i) => (
              <div key={i} className="bg-[#121b22] border border-[#1f2c34] p-4 rounded-xl flex items-center justify-between hover:border-[#2a3942] transition">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${f.active ? 'bg-[#007aff]/10 text-[#007aff]' : 'bg-[#202c33] text-slate-500'}`}>
                    <i className="ph-fill ph-tree-structure"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{f.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                      <i className="ph ph-lightning"></i> {f.trigger}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked={f.active} />
                    <div className="w-9 h-5 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#22c55e]"></div>
                  </label>
                  <button 
                    onClick={() => { setEditingFlow(f.name); setView("editor"); }}
                    className="text-slate-400 hover:text-white bg-[#202c33] hover:bg-[#2a3942] p-2 rounded transition"
                  >
                    <i className="ph ph-pencil-simple text-lg"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* B. Flujos Personalizados */}
        <div>
          <h2 className="text-lg font-bold text-white mb-4 border-b border-[#1f2c34] pb-2">Flujos Personalizados</h2>
          <div className="space-y-4">
            {[
              { name: "Campaña Día de la Madre", desc: "Promoción especial mayo", trigger: "Keyword: 'MAMA24'", active: false },
              { name: "Cotización Mayoristas", desc: "Formulario para negocios", trigger: "Keyword: 'mayorista'", active: true },
              { name: "Soporte Técnico App", desc: "Troubleshooting app móvil", trigger: "Selección menú principal", active: true }
            ].map((f, i) => (
              <div key={i} className="bg-[#121b22] border border-[#1f2c34] p-4 rounded-xl flex items-center justify-between hover:border-[#2a3942] transition">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${f.active ? 'bg-purple-500/10 text-purple-500' : 'bg-[#202c33] text-slate-500'}`}>
                    <i className="ph-fill ph-git-branch"></i>
                  </div>
                  <div>
                    <h3 className="font-bold text-white">{f.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{f.desc}</p>
                    <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                      <i className="ph ph-lightning"></i> {f.trigger}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked={f.active} />
                    <div className="w-9 h-5 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#22c55e]"></div>
                  </label>
                  <button 
                    onClick={() => { setEditingFlow(f.name); setView("editor"); }}
                    className="text-slate-400 hover:text-white bg-[#202c33] hover:bg-[#2a3942] p-2 rounded transition"
                  >
                    <i className="ph ph-pencil-simple text-lg"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
