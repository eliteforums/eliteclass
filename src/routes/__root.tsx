import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";
import { ThemeProvider, themeNoFlashScript } from "@/components/theme-provider";
import { AuthProvider } from "@/components/AuthProvider";
import { PWAProvider } from "@/components/pwa";
import { Toaster } from "@/components/ui/sonner";
import { getErrorMessage } from "@/utils/helpers";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const message = getErrorMessage(error);
  if (import.meta.env.DEV) console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "EliteClass — AI-Powered Institute Management Platform" },
      {
        name: "description",
        content:
          "EliteClass is the all-in-one platform for coaching institutes, schools, and academies. Manage students, attendance, fees, exams, courses, and more with AI-powered automation.",
      },
      {
        name: "keywords",
        content:
          "institute management, coaching software, school ERP, student management, attendance tracking, fee management, LMS, exam management, AI education, EliteClass",
      },
      { name: "author", content: "EliteClass" },
      { name: "robots", content: "index, follow" },
      { property: "og:title", content: "EliteClass — AI-Powered Institute Management Platform" },
      {
        property: "og:description",
        content:
          "All-in-one platform for coaching institutes, schools, and academies. ERP, LMS, CRM, and AI automation unified.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "EliteClass" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "EliteClass — AI-Powered Institute Management" },
      {
        name: "twitter:description",
        content:
          "Manage your institute with AI-powered automation. Students, attendance, fees, exams, courses — all in one place.",
      },
      { name: "theme-color", content: "#6366f1" },
    ],
    links: [
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,200..800;1,200..800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        type: "image/x-icon",
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "EliteClass",
              applicationCategory: "EducationalApplication",
              operatingSystem: "Web",
              description: "AI-powered institute management platform",
              offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
            }),
          }}
        />
      </head>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeNoFlashScript }} />
        <Toaster richColors position="top-right" />
        {children}
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PWAProvider>
            <Outlet />
          </PWAProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
