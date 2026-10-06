import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp Ventas — IA que vende por WhatsApp",
  description:
    "Tu WhatsApp con una IA que cotiza, toma pedidos y escala a humano. Panel con contactos, reportes y cerebro IA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}