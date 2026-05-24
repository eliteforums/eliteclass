import { Link } from "@tanstack/react-router";
import { GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

export function Nav() {
  return (
    <header className="sticky top-0 z-50 w-full">
      <div className="mx-auto max-w-7xl px-6 py-4">
        <nav className="glass flex items-center justify-between rounded-2xl px-5 py-3 shadow-card">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-primary">
              <GraduationCap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold tracking-tight">EduOS</span>
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#features"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Features
            </a>
            <a
              href="#ai"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              AI
            </a>
            <a
              href="#pricing"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              Pricing
            </a>
            <a
              href="#faq"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              FAQ
            </a>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link to="/auth/login" className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link to="/auth/register-institute">
              <Button
                size="sm"
                className="bg-gradient-primary text-primary-foreground hover:opacity-90"
              >
                Get started free
              </Button>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
