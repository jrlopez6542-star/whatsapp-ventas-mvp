import Link from "next/link";

export default function Home() {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <Link href="/" className="lp-brand">
          WhatsApp Ventas
        </Link>
        <span className="lp-nav-spacer" />
        <a className="ghost" href="#precios">
          Precios
        </a>
        <a className="ghost" href="#faq">
          FAQ
        </a>
        <Link href="/panel" className="lp-btn lp-btn-primary">
          Abrir panel
        </Link>
      </nav>

      <header className="lp-hero">
        <div>
          <p className="lp-eyebrow">WhatsApp · IA · Colombia</p>
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
            <span>
              <strong>Responde</strong> en segundos
            </span>
            <span>·</span>
            <span>
              <strong>Cotiza</strong> y crea pedidos
            </span>
            <span>·</span>
            <span>
              Escala a <strong>humano</strong> cuando toca
            </span>
          </div>
        </div>

        <div className="lp-mock" aria-hidden>
          <div className="lp-mock-head">
            <span className="lp-dot" />
            WhatsApp Ventas · en línea
          </div>
          <div className="lp-bubble lp-bubble-user">
            Hola, ¿tienen el kit en presentación grande?
          </div>
          <div className="lp-bubble lp-bubble-bot">
            ¡Hola! 👋 Sí. El kit grande cuesta $180.000 e incluye envío. ¿Te armo
            la cotización?
          </div>
          <div className="lp-bubble lp-bubble-user">Perfecto, quiero 2</div>
          <div className="lp-bubble lp-bubble-bot">
            Listo ✅ 2 kits = $360.000. ¿Me confirmas la dirección de entrega?
          </div>
        </div>
      </header>

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
            <p style={{ marginTop: "1rem" }}>
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
            <p style={{ marginTop: "1rem" }}>
              <Link href="/panel" className="lp-btn lp-btn-secondary">
                Ver panel (próximamente)
              </Link>
            </p>
          </article>
        </div>
      </section>

      <section className="lp-section">
        <h2>De cero a atendiendo, el mismo día</h2>
        <p className="lp-sub">
          Sin instalar nada. Todo se maneja desde un panel en el navegador.
        </p>
        <div className="lp-steps">
          {[
            {
              n: "1",
              t: "Conectamos tu WhatsApp",
              d: "Con Twilio WhatsApp Business. Tú confirmas y listo.",
            },
            {
              n: "2",
              t: "Le enseñas tu negocio",
              d: "Catálogo, precios, tono, FAQ, políticas y reglas.",
            },
            {
              n: "3",
              t: "La IA atiende sola",
              d: "Responde, cotiza y toma pedidos 24/7. Si se sale, te pasa.",
            },
            {
              n: "4",
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
            },
            {
              t: "El cerebro de la IA",
              d: "FAQ, políticas, tono, horario y reglas editables.",
            },
            {
              t: "Pedidos y reportes",
              d: "Seguimiento de cada pedido y métricas del mes.",
            },
            {
              t: "Atención 24/7",
              d: "Responde de inmediato, incluso de noche y festivos.",
            },
            {
              t: "Cotizaciones automáticas",
              d: "Calcula precios y arma el pedido sin mover un dedo.",
            },
            {
              t: "Contactos y etiquetas",
              d: "Cada cliente queda registrado y clasificado.",
            },
          ].map((f) => (
            <article key={f.t} className="lp-card">
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section" id="precios">
        <h2>Una tarifa fija al mes. Sin sorpresas.</h2>
        <p className="lp-sub">
          Eliges el plan por el volumen de mensajes que maneja tu negocio.
        </p>
        <div className="lp-pricing">
          <article className="lp-price-card">
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
            <Link href="/panel" className="lp-btn lp-btn-secondary">
              Empezar
            </Link>
          </article>
          <article className="lp-price-card featured">
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
            <Link href="/panel" className="lp-btn lp-btn-primary">
              Empezar Pro
            </Link>
          </article>
          <article className="lp-price-card">
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
            <Link href="/panel" className="lp-btn lp-btn-secondary">
              Empezar
            </Link>
          </article>
        </div>
        <p className="lp-sub" style={{ marginTop: "1.25rem" }}>
          El costo de la IA va incluido. Lo único aparte es tu consumo de
          WhatsApp (Twilio / Meta).
        </p>
      </section>

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

      <div className="lp-cta-band">
        <h2>Pon tu WhatsApp a trabajar hoy</h2>
        <p>Abre el panel, carga tu catálogo y empieza a atender en piloto automático.</p>
        <Link href="/panel" className="lp-btn lp-btn-primary">
          Abrir panel →
        </Link>
      </div>

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
  );
}