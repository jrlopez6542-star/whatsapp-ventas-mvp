import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./crm.css";

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
      <head>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" />
        <link rel="stylesheet" href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}