import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeWrapper } from "@/components/theme-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ToastProvider } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Encomendas SaaS - Gestão de Encomendas para Condomínios",
  description: "Sistema SaaS de gestão de encomendas com QRCode e WhatsApp",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0f172a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={inter.className}>
        <ThemeWrapper>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </ThemeWrapper>
      </body>
    </html>
  );
}
