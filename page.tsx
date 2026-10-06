1
import Link from "next/link";
2


3
export default function Home() {
4
  return (
5
    <div className="lp">
6
      <nav className="lp-nav">
7
        <Link href="/" className="lp-brand">
8
          WhatsApp Ventas
9
        </Link>
10
        <span className="lp-nav-spacer" />
11
        <a className="ghost" href="#precios">
12
          Precios
13
        </a>
14
        <a className="ghost" href="#faq">
15
          FAQ
16
        </a>
17
        <Link href="/panel" className="lp-btn lp-btn-primary">
18
          Abrir panel
19
        </Link>
20
      </nav>
21


22
      <header className="lp-hero">
23
        <div>
24
          <p className="lp-eyebrow">WhatsApp · IA · Colombia</p>
25
          <h1>
26
            Tu WhatsApp, con una IA que <span>vende</span> por ti.
27
          </h1>
28
          <p className="lp-lead">
29
            Responde al instante, arma cotizaciones, toma pedidos y hace
30
            seguimiento — todos los días, a toda hora, sin que tengas que estar
31
            pendiente del teléfono.
32
          </p>
