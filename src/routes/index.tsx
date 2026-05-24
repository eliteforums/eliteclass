import { createFileRoute } from "@tanstack/react-router";
import { Nav } from "@/components/landing/Nav";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { AISection } from "@/components/landing/AISection";
import { Pricing } from "@/components/landing/Pricing";
import { FAQ } from "@/components/landing/FAQ";
import { CTA } from "@/components/landing/CTA";
import { Footer } from "@/components/landing/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EduOS — AI-Powered Educational Operating System" },
      {
        name: "description",
        content:
          "EduOS unifies ERP, LMS, CRM, communication and AI automation into one operating system for modern educational institutes.",
      },
      { property: "og:title", content: "EduOS — The OS for modern institutes" },
      {
        property: "og:description",
        content:
          "ERP, LMS, CRM, AI automation — unified for coaching institutes, schools and academies.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main>
        <Hero />
        <Features />
        <AISection />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
