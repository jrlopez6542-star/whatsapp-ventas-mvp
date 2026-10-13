"use client";
import React, { useState, useEffect, useRef } from "react";

export function SettingsView() {
  const [settings, setSettings] = useState({
    name: "",
    tone: "",
    welcomeMessage: "",
    rules: "",
    transferQrImage: "",
    nequiNumber: "",
    brebKey: "",
    deliveryFee: "",
    freeDeliveryThreshold: "",
    estimatedDeliveryTime: "",
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-refresh config state
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshSecs, setRefreshSecs] = useState(5);
  const [savedRefreshMsg, setSavedRefreshMsg] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedAuto = localStorage.getItem("crm_auto_refresh");
      if (savedAuto !== null) setAutoRefresh(savedAuto === "true");
      const savedInt = localStorage.getItem("crm_refresh_interval");
      if (savedInt !== null) {
        const val = parseInt(savedInt, 10);
        if (!isNaN(val) && val >= 2) setRefreshSecs(val);
      }
    }
  }, []);

  const handleToggleAutoRefresh = (enabled: boolean) => {
    setAutoRefresh(enabled);
    if (typeof window !== "undefined") {
      localStorage.setItem("crm_auto_refresh", String(enabled));
      window.dispatchEvent(new StorageEvent("storage", { key: "crm_auto_refresh", newValue: String(enabled) }));
    }
    setSavedRefreshMsg(true);
    setTimeout(() => setSavedRefreshMsg(false), 2500);
  };

  const handleChangeInterval = (secs: number) => {
    setRefreshSecs(secs);
    if (typeof window !== "undefined") {
      localStorage.setItem("crm_refresh_interval", String(secs));
      window.dispatchEvent(new StorageEvent("storage", { key: "crm_refresh_interval", newValue: String(secs) }));
    }
    setSavedRefreshMsg(true);
    setTimeout(() => setSavedRefreshMsg(false), 2500);
  };

  useEffect(() => {
    fetch("/api/panel/settings")
      .then(r => r.json())
      .then(d => {
        if (d.ok && d.settings) {
          setSettings({
            name: d.settings.name || "",
            tone: d.settings.tone || "",
            welcomeMessage: d.settings.welcomeMessage || "",
            rules: d.settings.rules || "",
            transferQrImage: d.settings.transferQrImage || "",
            nequiNumber: d.settings.nequiNumber || "",
            brebKey: d.settings.brebKey || "",
            deliveryFee: d.settings.deliveryFee || "",
            freeDeliveryThreshold: d.settings.freeDeliveryThreshold || "",
            estimatedDeliveryTime: d.settings.estimatedDeliveryTime || "",
          });
        }
      })
      .catch(() => {});
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert("La imagen no debe superar 10MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setSettings(prev => ({ ...prev, transferQrImage: compressed }));
        } else {
          setSettings(prev => ({ ...prev, transferQrImage: src }));
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setSettings(prev => ({ ...prev, transferQrImage: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);
    try {
      const res = await fetch("/api/panel/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        alert("Error al guardar la configuración.");
      }
    } catch {
      alert("Error de conexión al guardar.");
    }
    setSaving(false);
  };

  return (
    <div className="p-6 pt-16 md:pt-6 text-slate-300 w-full h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
            <i className="ph-fill ph-gear text-slate-400"></i> Configuración del Negocio
          </h1>
          <p className="text-sm text-slate-400">
            Estos parámetros se inyectan directamente en el prompt y funcionamiento del bot de WhatsApp.
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

          <form onSubmit={handleSave} className="space-y-6">
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
                rows={4}
                value={settings.rules}
                onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
                className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-4 py-2.5 transition outline-none resize-none font-mono text-sm"
                placeholder="- No damos descuentos..."
              />
            </div>

            {/* SECCIÓN PAGOS MÓVILES (NEQUI / BRE-B) */}
            <div className="pt-4 border-t border-[#1f2c34]">
              <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <i className="ph-fill ph-device-mobile text-emerald-400 text-lg"></i> Datos de Pago Móvil (Copia Rápida)
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                El bot enviará estos datos en un formato limpio para que el cliente pueda presionar y copiar en su app bancaria en 3 segundos.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Número Nequi</label>
                  <input
                    type="text"
                    value={settings.nequiNumber}
                    onChange={(e) => setSettings({ ...settings, nequiNumber: e.target.value })}
                    className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Ej. 3228964947"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Llave Bre-B</label>
                  <input
                    type="text"
                    value={settings.brebKey}
                    onChange={(e) => setSettings({ ...settings, brebKey: e.target.value })}
                    className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Ej. 3228964947"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN DOMICILIO Y TIEMPOS */}
            <div className="pt-4 border-t border-[#1f2c34]">
              <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
                <i className="ph-fill ph-moped text-amber-400 text-lg"></i> Costo de Domicilio y Tiempo de Entrega (ETA)
              </h3>
              <p className="text-xs text-slate-400 mb-4">
                Parámetros para el cálculo automático del domicilio y el tiempo estimado que el bot le indica al cliente.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Costo Domicilio ($ COP)</label>
                  <input
                    type="number"
                    value={settings.deliveryFee}
                    onChange={(e) => setSettings({ ...settings, deliveryFee: e.target.value })}
                    className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Ej. 4000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Envío Gratis Desde ($ COP)</label>
                  <input
                    type="number"
                    value={settings.freeDeliveryThreshold}
                    onChange={(e) => setSettings({ ...settings, freeDeliveryThreshold: e.target.value })}
                    className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Ej. 40000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tiempo Estimado (ETA)</label>
                  <input
                    type="text"
                    value={settings.estimatedDeliveryTime}
                    onChange={(e) => setSettings({ ...settings, estimatedDeliveryTime: e.target.value })}
                    className="w-full bg-[#0b141a] border border-[#2a3942] focus:border-[#007aff] focus:ring-1 focus:ring-[#007aff] text-white rounded-lg px-3 py-2 text-sm outline-none"
                    placeholder="Ej. 30 a 45 minutos"
                  />
                </div>
              </div>
            </div>

            {/* SECCIÓN IMAGEN QR DE TRANSFERENCIA */}
            <div className="pt-4 border-t border-[#1f2c34]">
              <label className="block text-sm font-medium text-slate-300 mb-1 flex items-center gap-2">
                <i className="ph-fill ph-qr-code text-[#007aff] text-lg"></i> Código QR para Transferencia (Nequi / Daviplata / Bancolombia)
              </label>
              <p className="text-xs text-slate-400 mb-3">
                Si el cliente elige pagar por transferencia, el bot le enviará automáticamente este código QR por WhatsApp.
              </p>

              {settings.transferQrImage ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 bg-[#162128] border border-[#2a3942] rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.transferQrImage}
                    alt="Código QR de Transferencia"
                    className="w-32 h-32 object-contain bg-white p-2 rounded-lg border border-[#2a3942] shadow-sm"
                  />
                  <div className="space-y-2">
                    <p className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                      <i className="ph-fill ph-check-circle"></i> Imagen QR cargada y lista para enviarse
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs bg-[#202c33] hover:bg-[#2a3942] text-slate-200 px-3 py-1.5 rounded-lg border border-[#2a3942] transition"
                      >
                        Cambiar imagen
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/20 transition flex items-center gap-1"
                      >
                        <i className="ph ph-trash"></i> Eliminar
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-[#2a3942] hover:border-[#007aff] p-6 rounded-xl flex flex-col items-center justify-center cursor-pointer transition bg-[#162128]/50 hover:bg-[#162128]"
                >
                  <i className="ph-fill ph-upload-simple text-3xl text-slate-400 mb-2"></i>
                  <span className="text-sm font-medium text-slate-300">Haz clic aquí para subir una imagen del QR</span>
                  <span className="text-xs text-slate-500 mt-1">Archivos compatibles: .png, .jpg, .jpeg, .img (hasta 5MB)</span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>

            <div className="pt-4 border-t border-[#1f2c34]">
              <button 
                type="submit" 
                disabled={saving}
                className="bg-[#007aff] hover:bg-[#005bb5] disabled:opacity-50 text-white font-medium px-6 py-2.5 rounded-lg transition flex items-center gap-2"
              >
                {saving && <i className="ph ph-spinner animate-spin"></i>}
                {saving ? "Guardando..." : "Guardar Cambios"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* SECCIÓN ACTUALIZACIÓN EN VIVO Y AUTO-REFRESCO */}
      <div className="bg-[#121b22] border border-[#1f2c34] rounded-xl overflow-hidden max-w-2xl mt-8">
        <div className="p-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <i className="ph-fill ph-arrows-clockwise text-[#007aff]"></i> Actualización en Vivo y Auto-Refresco
            </h2>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium flex items-center gap-1.5 ${autoRefresh ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'}`}>
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}></span>
              {autoRefresh ? 'Activo en segundo plano' : 'Pausado'}
            </span>
          </div>

          <p className="text-sm text-slate-400 mb-5 leading-relaxed">
            Sincroniza automáticamente los chats, mensajes y pedidos sin recargar la página, sin interrumpir tu escritura y sin perder el chat que tienes abierto.
          </p>

          {savedRefreshMsg && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-2 rounded-lg mb-4 flex items-center gap-2">
              <i className="ph-fill ph-check-circle"></i> Preferencia de auto-refresco actualizada al instante.
            </div>
          )}

          <div className="space-y-4 bg-[#0b141a] p-4 rounded-lg border border-[#2a3942]/60">
            {/* INTERRUPTOR PRINCIPAL */}
            <div className="flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-white block">Auto-Refresco Periódico</span>
                <span className="text-xs text-slate-400">Actualizar chats y pedidos de manera transparente</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={autoRefresh}
                  onChange={(e) => handleToggleAutoRefresh(e.target.checked)}
                />
                <div className="w-11 h-6 bg-[#202c33] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#007aff]"></div>
              </label>
            </div>

            {/* FRECUENCIA */}
            <div className="pt-4 border-t border-[#1f2c34] flex items-center justify-between flex-wrap gap-3">
              <div>
                <span className="text-sm font-semibold text-white block">Frecuencia de Sincronización</span>
                <span className="text-xs text-slate-400">Intervalo entre consultas silenciosas al servidor</span>
              </div>
              <select
                value={refreshSecs}
                disabled={!autoRefresh}
                onChange={(e) => handleChangeInterval(Number(e.target.value))}
                className="bg-[#121b22] text-white text-xs font-semibold px-3 py-2 rounded-lg border border-[#2a3942] focus:border-[#007aff] outline-none cursor-pointer disabled:opacity-40"
              >
                <option value={3}>Cada 3 segundos (Ultra rápido)</option>
                <option value={5}>Cada 5 segundos (Recomendado)</option>
                <option value={10}>Cada 10 segundos</option>
                <option value={30}>Cada 30 segundos</option>
              </select>
            </div>
          </div>
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
