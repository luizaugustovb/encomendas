"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Clock, CheckCircle, CalendarDays, Users, Building2 } from "lucide-react";

export default function DashboardPage() {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      api.getDashboardStats(token)
        .then(setStats)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [token]);

  if (loading) {
    return <div className="animate-pulse">Carregando dashboard...</div>;
  }

  const cards = [
    {
      title: "Total de Encomendas",
      value: stats?.total || 0,
      icon: Package,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      title: "Pendentes",
      value: stats?.pending || 0,
      icon: Clock,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      title: "Retiradas",
      value: stats?.withdrawn || 0,
      icon: CheckCircle,
      color: "text-green-500",
      bg: "bg-green-500/10",
    },
    {
      title: "Hoje",
      value: stats?.todayCount || 0,
      icon: CalendarDays,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
    },
    {
      title: "Usuários",
      value: stats?.usersCount || 0,
      icon: Users,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
    },
    {
      title: "Unidades",
      value: stats?.unitsCount || 0,
      icon: Building2,
      color: "text-pink-500",
      bg: "bg-pink-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral do sistema de encomendas</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
