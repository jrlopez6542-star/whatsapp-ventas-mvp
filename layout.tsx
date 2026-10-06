1
import type { Metadata } from "next";
2
import "./globals.css";
3


4
export const metadata: Metadata = {
5
  title: "WhatsApp Ventas — IA que vende por WhatsApp",
6
  description:
7
    "Tu WhatsApp con una IA que cotiza, toma pedidos y escala a humano. Panel con contactos, reportes y cerebro IA.",
8
};
9


10
export default function RootLayout({
11
  children,
12
}: Readonly<{
13
  children: React.ReactNode;
14
}>) {
15
  return (
16
    <html lang="es">
17
      <body>{children}</body>
18
    </html>
19
  );
20
}
