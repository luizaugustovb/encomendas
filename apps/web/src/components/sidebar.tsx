"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Package,
  LayoutDashboard,
  Users,
  Building2,
  MapPin,
  LogOut,
  Shield,
  Settings,
  Monitor,
  FileSearch,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO", "ZELADOR"] },
  { href: "/dashboard/deliveries", label: "Encomendas", icon: Package, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO", "ZELADOR"] },
  { href: "/dashboard/audit", label: "Logs de Auditoria", icon: FileSearch, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/users", label: "Usuários", icon: Users, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/units", label: "Unidades", icon: Building2, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/locations", label: "Localizações", icon: MapPin, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/tenants", label: "Condomínios", icon: Shield, roles: ["ADMIN"] },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/totem", label: "Totem", icon: Monitor, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const filteredNav = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
      {/* Logo */}
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Package className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold">Encomendas</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t p-4">
        <div className="mb-2">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.tenantName}</p>
          <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase().replace('_', ' ')}</p>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </aside>
  );
}
