"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const LIGHT_THEME_CSS = "body{background-color:#f8fafc!important;color:#0f172a!important}.lp-wrapper{--lp-bg:#f8fafc!important;--lp-bg-card:#ffffff!important;--lp-border:#e2e8f0!important;--lp-border-hover:rgba(37,211,102,0.5)!important;--lp-text:#0f172a!important;--lp-text-muted:#64748b!important;--lp-text-subtle:#334155!important;--lp-glow:radial-gradient(ellipse 70% 60% at 50% -10%,rgba(37,211,102,0.12),rgba(56,189,248,0.08) 50%,transparent 80%)!important;--lp-nav-bg:rgba(255,255,255,0.88)!important;--lp-nav-border:#e2e8f0!important;--lp-nav-shadow:0 10px 30px rgba(15,23,42,0.06)!important;--lp-nav-ghost-hover:rgba(15,23,42,0.05)!important;--lp-btn-primary-bg:linear-gradient(135deg,#25d366 0%,#16a34a 100%)!important;--lp-btn-primary-hover:linear-gradient(135deg,#20ba5a 0%,#15803d 100%)!important;--lp-btn-primary-color:#ffffff!important;--lp-btn-sec-bg:#ffffff!important;--lp-btn-sec-border:#cbd5e1!important;--lp-btn-sec-color:#0f172a!important;--lp-btn-sec-hover-bg:#f1f5f9!important;--lp-btn-sec-hover-border:#94a3b8!important;--lp-badge-bg:#ffffff!important;--lp-badge-border:#e2e8f0!important;--lp-mock-bg:#efeae2!important;--lp-mock-border:#cbd5e1!important;--lp-mock-shadow:0 25px 60px -15px rgba(0,0,0,0.12),0 0 30px rgba(37,211,102,0.12)!important;--lp-mock-head-bg:#f0f2f5!important;--lp-mock-title:#111b21!important;--lp-mock-subtext:#54656f!important;--lp-mock-date-bg:rgba(255,255,255,0.9)!important;--lp-mock-user-bubble:#d9fdd3!important;--lp-mock-bot-bubble:#ffffff!important;--lp-mock-bubble-text:#111b21!important;--lp-mock-meta-text:#667781!important;--lp-mock-input-bg:#ffffff!important;--lp-mock-input-text:#54656f!important;--lp-mock-mic:#00a884!important;--lp-card-shadow:0 4px 20px -2px rgba(0,0,0,0.05),0 2px 6px -1px rgba(0,0,0,0.02)!important;--lp-pill-bg:rgba(37,211,102,0.12)!important;--lp-pill-border:rgba(22,163,74,0.3)!important;--lp-pill-color:#15803d!important;--lp-pill-soon-bg:#f1f5f9!important;--lp-pill-soon-border:#cbd5e1!important;--lp-pill-soon-color:#64748b!important;--lp-featured-card-bg:linear-gradient(180deg,#f0fdf4 0%,#ffffff 100%)!important;--lp-featured-border:rgba(22,163,74,0.6)!important;--lp-featured-shadow:0 0 35px rgba(37,211,102,0.2),0 15px 35px rgba(0,0,0,0.06)!important;--lp-faq-open-bg:#f8fafc!important;--lp-faq-open-border:rgba(22,163,74,0.4)!important;--lp-cta-band-bg:linear-gradient(135deg,#065f46 0%,#0f172a 100%)!important;--lp-cta-border:rgba(37,211,102,0.4)!important;--lp-toggle-bg:#f1f5f9!important;--lp-toggle-border:#cbd5e1!important;--lp-toggle-color:#0284c7!important;--lp-code-bg:#e2e8f0!important}.lp-icon-sun{display:none!important}.lp-icon-moon{display:inline-flex!important}";

function applyThemeDom(theme: "dark" | "light") {
  const existing = document.getElementById("lp-theme-vars");
  if (theme === "light") {
    if (existing) {
      existing.textContent = LIGHT_THEME_CSS;
    } else {
      const st = document.createElement("style");
      st.id = "lp-theme-vars";
      st.textContent = LIGHT_THEME_CSS;
      document.head.appendChild(st);
    }
  } else {
    if (existing) existing.remove();
  }
}

export default function Home() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    try {
      const hasLightTag = !!document.getElementById("lp-theme-vars");
      const current = hasLightTag ? "light" : "dark";
      const root = document.getElementById("lp-root");
      if (root) root.setAttribute("data-theme", current);
      queueMicrotask(() => {
        setTheme(current);
      });

      const saved = localStorage.getItem("lp-theme");
      if (!saved && window.matchMedia) {
        const media = window.matchMedia("(prefers-color-scheme: light)");
        const handler = (e: MediaQueryListEvent) => {
          const sys = e.matches ? "light" : "dark";
          applyThemeDom(sys);
          if (root) root.setAttribute("data-theme", sys);
          setTheme(sys);
        };
        media.addEventListener("change", handler);
        return () => media.removeEventListener("change", handler);
      }
    } catch {
      // Storage access blocked or restricted
    }
  }, []);

  useEffect(() => {
    if (!isMenuOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    applyThemeDom(next);
    const root = document.getElementById("lp-root");
    if (root) root.setAttribute("data-theme", next);
    setTheme(next);
    try {
      localStorage.setItem("lp-theme", next);
    } catch {
      // Storage access blocked
    }
  };

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <div id="lp-root" className="lp-wrapper">
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var s=localStorage.getItem('lp-theme');var m=window.matchMedia('(prefers-color-scheme:light)').matches;var t=(s==='light'||s==='dark')?s:(m?'light':'dark');if(t==='light'){var st=document.createElement('style');st.id='lp-theme-vars';st.textContent='${LIGHT_THEME_CSS}';document.head.appendChild(st);}}catch(e){}})();`,
        }}
      />
      <div className="lp">
        {/* Navigation */}
        <nav className="lp-nav">
          <Link href="/" className="lp-brand" onClick={closeMenu}>
            <span className="lp-brand-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.17 8.17 0 0 1-1.25-4.46c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.44.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.49-.4-.42-.56-.43l-.47-.01c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.13.17 1.75 2.67 4.24 3.75.59.26 1.05.41 1.41.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.29z" />
              </svg>
            </span>
            <span className="lp-brand-text">WhatsApp Ventas</span>
          </Link>

          <span className="lp-nav-spacer" />

          {/* Desktop Links */}
          <div className="lp-nav-desktop-links">
            <a className="ghost" href="#precios">
              Precios
            </a>
            <a className="ghost" href="#faq">
              FAQ
            </a>
          </div>

          {/* Theme Toggle Button (Always accessible in top header) */}
          <button
            type="button"
            className="lp-theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            <span className="lp-icon-sun" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            </span>
            <span className="lp-icon-moon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </span>
          </button>

          {/* Desktop CTA Button */}
          <Link href="/panel" className="lp-btn lp-btn-primary lp-nav-cta-desktop">
            Abrir panel
          </Link>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            className="lp-nav-burger"
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú de navegación"}
          >
            {isMenuOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </nav>

        {/* Mobile Dropdown Menu (Accessible & Compact) */}
        {isMenuOpen && (
          <>
            <div
              className="lp-mobile-backdrop"
              onClick={closeMenu}
              aria-hidden="true"
            />
            <div className="lp-mobile-menu" role="dialog" aria-modal="true" aria-label="Navegación móvil">
              <a className="lp-mobile-link" href="#precios" onClick={closeMenu}>
                <span>Precios</span>
                <span>→</span>
              </a>
              <a className="lp-mobile-link" href="#faq" onClick={closeMenu}>
                <span>Preguntas frecuentes</span>
                <span>→</span>
              </a>
              <a className="lp-mobile-link" href="#modos" onClick={closeMenu}>
                <span>Modos de uso</span>
                <span>→</span>
              </a>
              <div style={{ marginTop: "0.5rem" }}>
                <Link href="/panel" className="lp-btn lp-btn-primary lp-mobile-cta" onClick={closeMenu}>
                  Abrir panel →
                </Link>
              </div>
            </div>
          </>
        )}

        {/* Hero Section */}
        <header className="lp-hero">
          <div>
            <div className="lp-eyebrow">
              <span className="lp-eyebrow-dot" />
              WhatsApp · IA · Colombia
            </div>
            <h1>
              Tu WhatsApp, con una IA que <span>vende</span> por ti.
            </h1>
            <p className="lp-lead">
              Responde al instante, arma cotizaciones, toma pedidos y hace
              seguimiento — todos los días, a toda hora, sin que tengas que estar
              pendiente del teléfono.
            </p>
            <div className="lp-cta-row">
              <Link href="/panel" className="lp-btn lp-btn-primary">
                Empezar en el panel →
              </Link>
              <a href="#modos" className="lp-btn lp-btn-secondary">
                Ver modos
              </a>
            </div>
            <div className="lp-badges">
              <span className="lp-badge-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#25d366" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                <span><strong>Responde</strong> en segundos</span>
              </span>
              <span className="lp-badge-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                <span><strong>Cotiza</strong> y crea pedidos</span>
              </span>
              <span className="lp-badge-item">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span>Escala a <strong>humano</strong> cuando toca</span>
              </span>
            </div>
          </div>

          {/* WhatsApp Chat Mockup */}
          <div className="lp-mock" aria-hidden>
            <div className="lp-mock-head">
              <div className="lp-mock-profile">
                <div className="lp-mock-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.42 0-2.82-.37-4.06-1.08l-.29-.17-3.12.82.83-3.04-.19-.3a8.17 8.17 0 0 1-1.25-4.46c0-4.54 3.7-8.24 8.24-8.24z" />
                  </svg>
                </div>
                <div className="lp-mock-user-info">
                  <span className="lp-mock-title">WhatsApp Ventas</span>
                  <span className="lp-mock-status">
                    <span className="lp-dot" /> en línea
                  </span>
                </div>
              </div>
              <div className="lp-mock-actions">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="12" cy="19" r="1.5" />
                </svg>
              </div>
            </div>

            <div className="lp-mock-body">
              <span className="lp-mock-date">Hoy</span>
              <div className="lp-bubble lp-bubble-user">
                <div>Hola, ¿tienen el kit en presentación grande?</div>
                <div className="lp-msg-meta">
                  <span>10:41 a. m.</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 7 17l-5-5" />
                    <path d="m22 10-7.5 7.5L13 16" />
                  </svg>
                </div>
              </div>
              <div className="lp-bubble lp-bubble-bot">
                <div>¡Hola! 👋 Sí. El kit grande cuesta $180.000 e incluye envío. ¿Te armo la cotización?</div>
                <div className="lp-msg-meta">
                  <span>10:41 a. m.</span>
                </div>
              </div>
              <div className="lp-bubble lp-bubble-user">
                <div>Perfecto, quiero 2</div>
                <div className="lp-msg-meta">
                  <span>10:42 a. m.</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 7 17l-5-5" />
                    <path d="m22 10-7.5 7.5L13 16" />
                  </svg>
                </div>
              </div>
              <div className="lp-bubble lp-bubble-bot">
                <div>Listo ✅ 2 kits = $360.000. ¿Me confirmas la dirección de entrega?</div>
                <div className="lp-msg-meta">
                  <span>10:42 a. m.</span>
                </div>
              </div>
            </div>

            <div className="lp-mock-footer">
              <div className="lp-mock-input">
                <span>Escribe un mensaje...</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </div>
              <div className="lp-mock-mic">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
            </div>
          </div>
        </header>

        {/* Modes Section */}
        <section className="lp-section" id="modos">
          <h2>¿Para qué lo necesitas?</h2>
          <p className="lp-sub">
            Elige el modo según tu negocio. Hoy el panel está listo para Ventas;
            Agendamiento llega pronto.
          </p>
          <div className="lp-modes">
            <article className="lp-card">
              <span className="lp-pill">Disponible</span>
              <h3>Vender más</h3>
              <p>
                Para tiendas, distribuidores y servicios que cotizan y despachan
                por WhatsApp.
              </p>
              <ul>
                <li>Responde dudas de productos y precios al instante</li>
                <li>Arma la cotización y registra el pedido sola</li>
                <li>Hace seguimiento hasta cerrar la venta</li>
              </ul>
              <p style={{ marginTop: "1.25rem" }}>
                <Link href="/panel" className="lp-btn lp-btn-primary">
                  Ir al modo Ventas
                </Link>
              </p>
            </article>
            <article className="lp-card">
              <span className="lp-pill lp-pill-soon">Próximamente</span>
              <h3>Llenar tu agenda</h3>
              <p>
                Para consultorios, salones, spas y negocios que trabajan con
                citas.
              </p>
              <ul>
                <li>Muestra horarios libres en tiempo real</li>
                <li>Agenda, confirma y reagenda sola</li>
                <li>Envía recordatorios para bajar inasistencias</li>
              </ul>
              <p style={{ marginTop: "1.25rem" }}>
                <Link href="/panel" className="lp-btn lp-btn-secondary">
                  Ver panel (próximamente)
                </Link>
              </p>
            </article>
          </div>
        </section>

        {/* Steps Section */}
        <section className="lp-section">
          <h2>De cero a atendiendo, el mismo día</h2>
          <p className="lp-sub">
            Sin instalar nada. Todo se maneja desde un panel en el navegador.
          </p>
          <div className="lp-steps">
            {[
              {
                n: "01",
                t: "Conectamos tu WhatsApp",
                d: "Con Twilio WhatsApp Business. Tú confirmas y listo.",
              },
              {
                n: "02",
                t: "Le enseñas tu negocio",
                d: "Catálogo, precios, tono, FAQ, políticas y reglas.",
              },
              {
                n: "03",
                t: "La IA atiende sola",
                d: "Responde, cotiza y toma pedidos 24/7. Si se sale, te pasa.",
              },
              {
                n: "04",
                t: "Tú ves todo",
                d: "Conversaciones, contactos, pedidos y reportes en un solo lugar.",
              },
            ].map((s) => (
              <article key={s.n} className="lp-card">
                <div className="lp-step-num">{s.n}</div>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="lp-section">
          <h2>Todo bajo control, en un solo lugar</h2>
          <p className="lp-sub">
            La IA hace el trabajo pesado; tú supervisas cuando quieras.
          </p>
          <div className="lp-grid-3">
            {[
              {
                t: "Bandeja de conversaciones",
                d: "Chats bot/humano con takeover cuando haga falta.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                ),
              },
              {
                t: "El cerebro de la IA",
                d: "FAQ, políticas, tono, horario y reglas editables.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v4" />
                    <path d="m4.93 4.93 2.83 2.83" />
                    <path d="M2 12h4" />
                    <path d="m4.93 19.07 2.83-2.83" />
                    <path d="M12 18v4" />
                    <path d="m16.24 16.24 2.83 2.83" />
                    <path d="M18 12h4" />
                    <path d="m16.24 7.76 2.83-2.83" />
                  </svg>
                ),
              },
              {
                t: "Pedidos y reportes",
                d: "Seguimiento de cada pedido y métricas del mes.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                ),
              },
              {
                t: "Atención 24/7",
                d: "Responde de inmediato, incluso de noche y festivos.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                ),
              },
              {
                t: "Cotizaciones automáticas",
                d: "Calcula precios y arma el pedido sin mover un dedo.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="8" y1="6" x2="16" y2="6" />
                    <line x1="16" y1="14" x2="16" y2="18" />
                    <path d="M16 10h.01" />
                    <path d="M12 10h.01" />
                    <path d="M8 10h.01" />
                    <path d="M12 14h.01" />
                    <path d="M8 14h.01" />
                    <path d="M12 18h.01" />
                    <path d="M8 18h.01" />
                  </svg>
                ),
              },
              {
                t: "Contactos y etiquetas",
                d: "Cada cliente queda registrado y clasificado.",
                icon: (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
              },
            ].map((f) => (
              <article key={f.t} className="lp-card">
                <div className="lp-feat-icon">{f.icon}</div>
                <h3>{f.t}</h3>
                <p>{f.d}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section className="lp-section" id="precios">
          <h2>Una tarifa fija al mes. Sin sorpresas.</h2>
          <p className="lp-sub">
            Eliges el plan por el volumen de mensajes que maneja tu negocio.
          </p>
          <div className="lp-pricing">
            <article className="lp-price-card">
              <div>
                <h3>Básico</h3>
                <p>Ideal para pequeños negocios o emprendimientos.</p>
                <div className="lp-price">
                  $29 <span>USD/mes</span>
                </div>
                <ul>
                  <li>Hasta 1.000 mensajes al mes</li>
                  <li>IA de ventas</li>
                  <li>Panel y catálogo</li>
                </ul>
              </div>
              <Link href="/panel" className="lp-btn lp-btn-secondary">
                Empezar
              </Link>
            </article>
            <article className="lp-price-card featured">
              <div>
                <span className="lp-pill">Recomendado</span>
                <h3>Pro</h3>
                <p>Para negocios en crecimiento que necesitan más alcance.</p>
                <div className="lp-price">
                  $49 <span>USD/mes</span>
                </div>
                <ul>
                  <li>IA de ventas</li>
                  <li>Panel completo y reportes</li>
                  <li>Contactos, etiquetas y seguimiento</li>
                  <li>Deriva a un humano cuando toca</li>
                  <li>Hasta 130 productos</li>
                </ul>
              </div>
              <Link href="/panel" className="lp-btn lp-btn-primary">
                Empezar Pro
              </Link>
            </article>
            <article className="lp-price-card">
              <div>
                <h3>Premium</h3>
                <p>Para operaciones con alto volumen de conversaciones.</p>
                <div className="lp-price">
                  $79 <span>USD/mes</span>
                </div>
                <ul>
                  <li>Todo lo de Pro</li>
                  <li>Hasta 200 productos</li>
                  <li>Más usuarios activos</li>
                  <li>Soporte prioritario</li>
                </ul>
              </div>
              <Link href="/panel" className="lp-btn lp-btn-secondary">
                Empezar
              </Link>
            </article>
          </div>
          <p className="lp-sub" style={{ marginTop: "1.5rem", textAlign: "center" }}>
            El costo de la IA va incluido. Lo único aparte es tu consumo de
            WhatsApp (Twilio / Meta).
          </p>
        </section>

        {/* FAQ Section */}
        <section className="lp-section" id="faq">
          <h2>Preguntas frecuentes</h2>
          <div className="lp-faq">
            <details open>
              <summary>¿Sirve para ventas o para citas?</summary>
              <p>
                Hoy el panel está enfocado en Ventas (cotizar y tomar pedidos). El
                modo Agendamiento está marcado como próximamente.
              </p>
            </details>
            <details>
              <summary>¿Necesito saber de tecnología?</summary>
              <p>
                No. Configuras catálogo, tono, FAQ y reglas desde el panel. La IA
                hace el resto.
              </p>
            </details>
            <details>
              <summary>¿La IA puede inventar precios?</summary>
              <p>
                No. Solo cotiza productos activos del catálogo. Si no sabe, escala
                a un humano.
              </p>
            </details>
            <details>
              <summary>¿Cómo se conecta con WhatsApp?</summary>
              <p>
                Usa Twilio WhatsApp (sandbox o producción). Configuras el webhook
                y listo.
              </p>
            </details>
            <details>
              <summary>¿Puedo cancelar o cambiar de plan?</summary>
              <p>Sí, cuando quieras. Sin permanencia.</p>
            </details>
          </div>
        </section>

        {/* Final CTA Band */}
        <div className="lp-cta-band">
          <h2>Pon tu WhatsApp a trabajar hoy</h2>
          <p>Abre el panel, carga tu catálogo y empieza a atender en piloto automático.</p>
          <Link href="/panel" className="lp-btn lp-btn-primary">
            Abrir panel →
          </Link>
        </div>

        {/* Footer */}
        <footer className="lp-foot">
          <span>WhatsApp Ventas</span>
          <span>·</span>
          <Link href="/api/health">Health</Link>
          <span>·</span>
          <Link href="/api/catalog">Catálogo API</Link>
          <span>·</span>
          <code>/api/webhooks/twilio/whatsapp</code>
        </footer>
      </div>
    </div>
  );
}