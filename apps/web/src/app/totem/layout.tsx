import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Totem - Retirada de Encomendas",
};

export default function TotemLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {children}
    </div>
  );
}
