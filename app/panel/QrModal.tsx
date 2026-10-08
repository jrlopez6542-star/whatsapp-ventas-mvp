import { useState, useEffect } from "react";

export function QrModal({ onClose }: { onClose: () => void }) {
  const [qrStatus, setQrStatus] = useState<any>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(30);
  const [isRenewing, setIsRenewing] = useState(false);

  const fetchQrStatus = async (forceRenew = false) => {
    try {
      if (forceRenew) {
        setIsRenewing(true);
        await fetch("/api/panel/whatsapp-qr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "renew" }),
        });
        setSecondsRemaining(30);
        await new Promise(r => setTimeout(r, 2000));
      }
      
      const res = await fetch("/api/panel/whatsapp-qr", { cache: "no-store" });
      const data = await res.json();
      
      if (data.ok) {
        setQrStatus(data);
        if (data.base64 && !data.connected) {
          setQrError("");
        }
      } else {
        setQrError(data.error || "Error cargando QR");
      }
    } catch (err) {
      setQrError("Error de conexión al cargar QR");
    } finally {
      setQrLoading(false);
      setIsRenewing(false);
    }
  };

  useEffect(() => {
    fetchQrStatus();

    const countdown = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          fetchQrStatus();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    const poller = setInterval(() => {
      fetchQrStatus();
    }, 5000);

    return () => {
      clearInterval(countdown);
      clearInterval(poller);
    };
  }, []);

  const handleDisconnect = async () => {
    if (!confirm("¿Seguro que deseas desconectar el bot de esta línea?")) return;
    setQrLoading(true);
    await fetch("/api/panel/whatsapp-qr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    fetchQrStatus();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-[999999] flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#111b21] border border-[#1f2c34] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-[#00a884] p-5 flex items-center justify-between">
          <h2 className="text-white text-xl font-bold flex items-center gap-2">
            <i className="ph ph-whatsapp-logo text-2xl"></i>
            Vincular WhatsApp
          </h2>
          <button onClick={onClose} className="text-white hover:text-green-100 transition text-2xl leading-none">&times;</button>
        </div>

        <div className="p-8 flex flex-col items-center">
          {qrLoading && !qrStatus ? (
            <div className="flex flex-col items-center justify-center py-10">
              <i className="ph ph-spinner animate-spin text-4xl text-[#00a884] mb-4"></i>
              <p className="text-slate-300">Cargando estado...</p>
            </div>
          ) : qrStatus?.connected ? (
            <div className="text-center w-full">
              <div className="w-20 h-20 bg-green-500/20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl text-green-500">
                <i className="ph-fill ph-check-circle"></i>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">¡Línea Conectada!</h3>
              <p className="text-slate-400 mb-6">Tu bot está respondiendo automáticamente.</p>
              
              <div className="bg-[#1e2a30] p-4 rounded-xl text-left mb-6 border border-[#2a3942]">
                <div className="flex justify-between mb-2">
                  <span className="text-slate-400">Instancia:</span>
                  <strong className="text-green-500">{qrStatus.instance}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Estado:</span>
                  <span className="bg-green-500/20 text-green-500 px-2 py-0.5 rounded text-sm font-medium">EN LÍNEA</span>
                </div>
              </div>

              <button onClick={handleDisconnect} className="w-full py-3 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 transition shadow-lg flex justify-center items-center gap-2">
                <i className="ph ph-power"></i> Desconectar Línea
              </button>
            </div>
          ) : (
            <div className="text-center w-full">
              <h3 className="text-xl font-semibold text-white mb-2">Escanea el código QR</h3>
              <p className="text-slate-400 mb-6 text-sm">Abre WhatsApp en tu teléfono &gt; Dispositivos Vinculados &gt; Vincular dispositivo</p>
              
              <div className="bg-white p-4 rounded-xl mx-auto inline-block relative min-w-[250px] min-h-[250px] flex items-center justify-center">
                {isRenewing ? (
                  <div className="flex flex-col items-center">
                    <i className="ph ph-spinner animate-spin text-3xl text-slate-800 mb-2"></i>
                    <p className="text-slate-800 text-sm font-semibold">Renovando...</p>
                  </div>
                ) : qrStatus?.base64 ? (
                  <img src={qrStatus.base64} alt="QR Code" className="w-[220px] h-[220px]" />
                ) : (
                  <div className="text-red-500 text-sm">
                    {qrError || "No se pudo cargar QR"}
                  </div>
                )}
              </div>

              <div className="mt-8">
                <div className="flex justify-between text-xs text-slate-400 mb-1">
                  <span>Expira en:</span>
                  <span className={secondsRemaining < 5 ? "text-red-400 font-bold" : "text-green-400"}>{secondsRemaining}s</span>
                </div>
                <div className="w-full h-1.5 bg-[#1e2a30] rounded-full overflow-hidden">
                  <div className={`h-full transition-all duration-1000 ${secondsRemaining < 5 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${(secondsRemaining / 30) * 100}%` }}></div>
                </div>
                <button onClick={() => fetchQrStatus(true)} disabled={isRenewing} className="mt-4 text-slate-300 hover:text-white bg-[#202c33] px-4 py-2 rounded-lg border border-[#2a3942] transition flex items-center gap-2 mx-auto text-sm">
                  <i className="ph ph-arrows-clockwise"></i> Renovar QR
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
