"use client";

import { useState, useEffect, createContext, useContext } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/toast";
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
  PanelLeftClose,
  PanelLeftOpen,
  X,
  Unlock,
} from "lucide-react";

// ===== Context para compartilhar estado da sidebar =====
interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => { },
  mobileOpen: false,
  setMobileOpen: () => { },
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse em telas menores que 1024px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setCollapsed(true);
      }
      // Fecha mobile overlay ao redimensionar para desktop
      if (window.innerWidth >= 768) {
        setMobileOpen(false);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, mobileOpen, setMobileOpen }}>
      {children}
    </SidebarContext.Provider>
  );
}

// ===== Navigation items =====
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO", "ZELADOR"] },
  { href: "/dashboard/deliveries", label: "Encomendas", icon: Package, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO", "ZELADOR"] },
  { href: "/dashboard/users", label: "Usuários", icon: Users, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/units", label: "Unidades", icon: Building2, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/locations", label: "Localizações", icon: MapPin, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/dashboard/tenants", label: "Condomínios", icon: Shield, roles: ["ADMIN"] },
  { href: "/dashboard/settings", label: "Configurações", icon: Settings, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
  { href: "/totem", label: "Totem", icon: Monitor, roles: ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO"] },
  { href: "/dashboard/audit", label: "Logs de Auditoria", icon: FileSearch, roles: ["ADMIN", "ADMIN_CONDOMINIO"] },
];

// ===== Sidebar Component =====
export function Sidebar() {
  const pathname = usePathname();
  const { user, token, logout } = useAuth();
  const [logoError, setLogoError] = useState(false);
  const { collapsed, setCollapsed, mobileOpen, setMobileOpen } = useSidebar();

  const filteredNav = navItems.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const handleNavClick = () => {
    // Fecha sidebar mobile ao navegar
    if (window.innerWidth < 768) {
      setMobileOpen(false);
    }
  };

  const { addToast } = useToast();
  const [openingDoor, setOpeningDoor] = useState(false);

  const handleOpenDoor = async () => {
    if (!user || !["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO"].includes(user.role)) return;
    setOpeningDoor(true);
    try {
      await api.openDoor(token || localStorage.getItem("encomendas_token") || "", 1);
      addToast("Porta destravada, você pode sair agora", "success");
    } catch (err: any) {
      addToast(err.message || "Erro ao abrir porta", "error");
    } finally {
      setOpeningDoor(false);
    }
  };

  const sidebarContent = (
    <aside
      className={cn(
        "flex h-screen flex-col border-r bg-sidebar text-sidebar-foreground transition-all duration-300",
        collapsed ? "w-[68px]" : "w-64"
      )}
    >
      {/* Logo + Toggle */}
      <div className={cn(
        "flex h-16 items-center border-b shrink-0",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}>
        {!collapsed && (
          <>
            {!logoError ? (
              <img src="/logo.png" alt="Logo" className="h-10 w-auto object-contain" onError={() => setLogoError(true)} />
            ) : (
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" />
                <span className="text-lg font-bold">Encomendas</span>
              </div>
            )}
          </>
        )}
        {collapsed && !logoError && (
          <Package className="h-6 w-6 text-primary" />
        )}

        {/* Toggle collapse - só aparece em desktop */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>

        {/* Close button - só aparece no mobile */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden flex items-center justify-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User info */}
      <div className="border-t p-2 shrink-0 space-y-2">
        {!collapsed && (
          <div className="mb-2 px-2">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.tenantName}</p>
            <p className="text-xs text-muted-foreground capitalize truncate">{user?.role?.toLowerCase().replace('_', ' ')}</p>
          </div>
        )}

        {user && ["ADMIN", "ADMIN_CONDOMINIO", "PORTEIRO"].includes(user.role) && (
          <button
            onClick={handleOpenDoor}
            disabled={openingDoor}
            title={collapsed ? "Destravar Porta" : undefined}
            className={cn(
              "flex w-full items-center rounded-lg text-sm transition-colors hover:bg-green-500/20 text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 disabled:opacity-50",
              collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2"
            )}
          >
            <Unlock className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
            {!collapsed && <span className="font-semibold">{openingDoor ? "Destravando..." : "Destravar Porta"}</span>}
          </button>
        )}
        <button
          onClick={logout}
          title={collapsed ? "Sair" : undefined}
          className={cn(
            "flex w-full items-center rounded-lg text-sm text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground",
            collapsed ? "justify-center px-2 py-2.5" : "gap-2 px-3 py-2"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sair"}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden md:block">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sidebar */}
          <div className="relative z-10 h-full w-64 animate-in slide-in-from-left duration-300">
            {/* Force expanded on mobile overlay */}
            <SidebarMobileOverride>
              {sidebarContent}
            </SidebarMobileOverride>
          </div>
        </div>
      )}
    </>
  );
}

// Helper: força sidebar expandida no overlay mobile
function SidebarMobileOverride({ children }: { children: React.ReactNode }) {
  const ctx = useSidebar();
  const wasCollapsed = ctx.collapsed;

  useEffect(() => {
    if (wasCollapsed) ctx.setCollapsed(false);
    return () => {
      if (wasCollapsed) ctx.setCollapsed(true);
    };
  }, []);

  return <>{children}</>;
}
