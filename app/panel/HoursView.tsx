"use client";

import React, { useState, useEffect } from "react";

export function HoursView() {
  const [enabled, setEnabled] = useState(false);
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("20:00");
  const [message, setMessage] = useState(
    "¡Hola! En este momento nos encontramos cerrados. 🌙 Te atenderemos con gusto en nuestro horario de atención. 🥟"
  );
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/panel/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.settings) {
          setEnabled(d.settings.businessHoursEnabled === "true");
          setStart(d.settings.businessHoursStart || "08:00");
          setEnd(d.settings.businessHoursEnd || "20:00");
          if (d.settings.outOfHoursMessage) {
            setMessage(d.settings.outOfHoursMessage);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      const res = await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessHoursEnabled: enabled ? "true" : "false",
          businessHoursStart: start,
          businessHoursEnd: end,
          outOfHoursMessage: message,
        }),
      });

      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert("Error al guardar la configuración de horarios.");
      }
    } catch {
      alert("Error de conexión al guardar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-clock text-[#007aff]"></i> Horarios de Atención
          </h1>
          <p className="text-sm text-slate-400">
            Define las horas en las que el bot toma pedidos y el mensaje automático que se envía fuera de turno.
          </p>
        </div>
      </div>

      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden max-w-2xl shadow-sm">
        <div className="p-6">
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-lg mb-6 flex items-center gap-2 text-sm font-medium">
              <i className="ph-fill ph-check-circle text-lg"></i> Horarios guardados exitosamente.
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-6">
            {/* SWITCH HABILITAR HORARIOS */}
            <div className="flex items-center justify-between p-4 bg-[#162128] border border-[#2a3942] rounded-xl">
              <div>
                <h3 className="font-semibold text-white text-sm">Control de Horarios Automático</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Si está activado, el bot solo responderá pedidos dentro del horario configurado (hora de Colombia).
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <div className="w-11 h-6 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007aff]"></div>
              </label>
            </div>

            {/* HORAS INICIO Y FIN */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 transition ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <i className="ph ph-sun text-amber-400"></i> HORA DE APERTURA (INICIO)
                </label>
                <input
                  type="time"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-4 py-2.5 text-sm outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1.5">
                  <i className="ph ph-moon text-indigo-400"></i> HORA DE CIERRE (FIN)
                </label>
                <input
                  type="time"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-4 py-2.5 text-sm outline-none"
                />
              </div>
            </div>

            {/* MENSAJE FUERA DE HORARIO */}
            <div className={`transition ${enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                MENSAJE AUTOMÁTICO FUERA DE HORARIO
              </label>
              <textarea
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="¡Hola! En este momento nos encontramos cerrados..."
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] text-white rounded-lg px-4 py-3 text-sm outline-none resize-none leading-relaxed"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Este mensaje se enviará automáticamente si un cliente escribe mientras el negocio está cerrado.
              </p>
            </div>

            <div className="pt-4 border-t border-[#1f2c34]">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#007aff] hover:bg-[#005bb5] disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition flex items-center gap-2"
              >
                {saving && <i className="ph ph-spinner animate-spin"></i>}
                {saving ? "Guardando..." : "Guardar Horarios"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
