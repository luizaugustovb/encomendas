"use client";

import { useAuth } from "@/lib/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";
import { Menu } from "lucide-react";
import { useSidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";

export function Header() {
  const { user } = useAuth();
  const { setMobileOpen } = useSidebar();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-9 w-9"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h2 className="text-base md:text-lg font-semibold truncate max-w-[160px] sm:max-w-[300px]">
          {user?.tenantName || "Sistema de Encomendas"}
        </h2>
      </div>
      <div className="flex items-center gap-3 md:gap-4">
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">
            {user?.name?.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium hidden sm:block truncate max-w-[120px]">{user?.name}</span>
        </div>
      </div>
    </header>
  );
}
