import { useState, useRef, useEffect } from "react";
import { Search, Bell, PanelLeft, Plus, LogOut, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuthStore } from "@/store/authStore";
import { signOut } from "@/services/auth.service";
import { ROLE_LABELS } from "@/utils/rbac";
import { getInitials } from "@/utils/helpers";
import type { UserRole } from "@/types";

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = user?.name ?? "User";
  const roleLabel = ROLE_LABELS[(user?.role ?? "student") as UserRole] ?? user?.role ?? "Student";
  const initials = getInitials(displayName);

  // Close the dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  async function handleLogout() {
    setMenuOpen(false);
    await signOut();
    logout();
    navigate({ to: "/auth/login", replace: true });
  }

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="flex min-h-14 items-center gap-3 px-3 py-2 sm:h-16 sm:px-4 md:px-6">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="inline-flex shrink-0"
          aria-label="Toggle navigation"
        >
          <PanelLeft className="h-4 w-4" />
        </Button>

        {/* Search bar */}
        <div className="relative hidden flex-1 max-w-md lg:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder="Search students, courses, invoices…"
            className="h-9 w-full rounded-lg border border-border bg-card/60 pl-9 pr-16 text-sm outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            size="sm"
            className="hidden bg-gradient-primary text-primary-foreground hover:opacity-90 sm:inline-flex"
          >
            <Plus className="h-4 w-4" /> New
          </Button>

          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-destructive" />
          </Button>

          <ThemeToggle />

          {/* User menu */}
          <div className="relative ml-1" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-accent/10"
              aria-label="User menu"
              aria-expanded={menuOpen}
            >
              {/* Avatar */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground">
                {initials}
              </div>
              {/* Name + role — hidden on small screens */}
              <div className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-xs font-medium text-foreground">{displayName}</span>
                <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
              </div>
              <ChevronDown
                className={`hidden h-3.5 w-3.5 text-muted-foreground transition-transform sm:block ${
                  menuOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-border bg-card shadow-lg z-50">
                {/* User info header */}
                <div className="border-b border-border px-3 py-2.5">
                  <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                  <p className="text-[10px] text-muted-foreground">{roleLabel}</p>
                </div>
                {/* Actions */}
                <div className="p-1">
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
