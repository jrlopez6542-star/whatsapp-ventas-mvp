"use client";
import React, { useState, useEffect } from "react";

export function SettingsView() {
  const [settings, setSettings] = useState({ name: "", tone: "", welcomeMessage: "", rules: "" });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/panel/settings")
      .then(r => r.json())
      .then(d => { if (d.ok && d.settings) setSettings(d.settings); })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="p-6 text-slate-300 w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-gear text-slate-400"></i> Configuración del Negocio
          </h1>
          <p className="text-sm text-slate-400">
            Estos parámetros se inyectan directamente en el prompt del agente de IA.
          </p>
        </div>
      </div>

      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden max-w-2xl">
        <div className="p-6">
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm font-medium">
              <i className="ph-fill ph-check-circle text-lg"></i> Configuración guardada exitosamente.
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Nombre del Negocio</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-4 py-2.5 transition outline-none"
                placeholder="Ej. Buñuelandia"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Tono de Comunicación</label>
              <input
                type="text"
                value={settings.tone}
                onChange={(e) => setSettings({ ...settings, tone: e.target.value })}
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-4 py-2.5 transition outline-none"
                placeholder="Ej. Amable, cercano y conciso"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Mensaje de Bienvenida</label>
              <textarea
                rows={3}
                value={settings.welcomeMessage}
                onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-4 py-2.5 transition outline-none resize-none"
                placeholder="¡Hola! Bienvenido a nuestra tienda..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1.5">Reglas de Negocio / Políticas</label>
              <textarea
                rows={5}
                value={settings.rules}
                onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-4 py-2.5 transition outline-none resize-none font-mono text-sm"
                placeholder="- No damos descuentos..."
              />
            </div>

            <div className="pt-4 border-t border-[#1f2c34]">
              <button 
                type="submit" 
                disabled={saving}
                className="bg-[#007aff] hover:bg-[#005bb5] disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition"
              >
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden max-w-2xl mt-8">
        <div className="p-6">
          <h2 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <i className="ph-fill ph-flask text-purple-400"></i> Pruebas de APIs (Test IA)
          </h2>
          <p className="text-sm text-slate-400 mb-6">Herramientas para desarrolladores para comprobar conexiones con Gemini y Evolution API.</p>
          
          <div className="space-y-3">
            <button onClick={() => window.open('/api/test', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-robot text-emerald-400 text-lg"></i> Probar Conexión con Gemini AI
            </button>
            <button onClick={() => window.open('/api/test2', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-whatsapp-logo text-green-500 text-lg"></i> Probar Envio a Evolution API
            </button>
            <button onClick={() => window.open('/api/test-order', '_blank')} className="w-full bg-[#202c33] hover:bg-[#2a3942] text-slate-300 font-medium px-4 py-3 rounded-lg border border-[#2a3942] transition flex items-center gap-3">
              <i className="ph-fill ph-package text-blue-400 text-lg"></i> Simular Pedido Terminado (Test AI)
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
