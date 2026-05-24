import { GraduationCap } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-primary">
            <GraduationCap className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold">EduOS</span>
          <span className="text-sm text-muted-foreground">— The OS for modern institutes</span>
        </div>
        <p className="text-sm text-muted-foreground">
          © {new Date().getFullYear()} EduOS. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
