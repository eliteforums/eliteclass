import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const FEATURE_BULLETS = [
  "Multi-tenant role-based access",
  "Real-time AI-powered insights",
  "Scales from 50 to 50,000 students",
];

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen">
      {/* ── Left Panel ─────────────────────────────────────────────────── */}
      <div className="hidden md:flex md:w-1/2 relative flex-col justify-between p-10 bg-linear-to-br from-slate-900 via-blue-950 to-indigo-950 overflow-hidden">
        {/* Radial gradient overlay for depth */}
        <div
          className="pointer-events-none absolute inset-0"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(99,102,241,0.18) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(59,130,246,0.12) 0%, transparent 70%)",
          }}
        />

        {/* Top-left: Logo */}
        <Link to="/" className="relative z-10 flex items-center gap-2.5 w-fit group">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 ring-1 ring-blue-400/30 group-hover:bg-blue-500/30 transition-colors">
            <GraduationCap className="h-5 w-5 text-blue-300" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">EduOS</span>
        </Link>

        {/* Center: Headline, subtitle, feature bullets */}
        <div className="relative z-10 flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-3xl font-bold text-white leading-tight">
              The Operating System for Modern Institutes
            </h1>
            <p className="text-slate-400 text-base leading-relaxed">
              ERP · LMS · CRM · AI — unified into one platform
            </p>
          </div>

          <ul className="flex flex-col gap-3.5">
            {FEATURE_BULLETS.map((bullet) => (
              <li key={bullet} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400" />
                <span className="text-slate-200 text-sm">{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom: Trust line */}
        <p className="relative z-10 text-xs text-slate-500">
          Trusted by 500+ institutes across India
        </p>
      </div>

      {/* ── Right Panel ────────────────────────────────────────────────── */}
      <div className="flex w-full md:w-1/2 flex-col items-center justify-center px-6 py-12 bg-background relative">
        {/* Theme toggle — top-right corner */}
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        {/* Content card */}
        <div className="w-full max-w-sm flex flex-col gap-0">
          {/* Mobile-only logo */}
          <Link to="/" className="md:hidden mb-8 flex items-center justify-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20 group-hover:bg-primary/20 transition-colors">
              <GraduationCap className="h-4 w-4 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
              EduOS
            </span>
          </Link>

          {/* Title & subtitle */}
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
            {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          </div>

          {/* Form content */}
          {children}

          {/* Footer links */}
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>

        {/* Copyright */}
        <p className="absolute bottom-4 text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} EduOS. All rights reserved.
        </p>
      </div>
    </div>
  );
}
