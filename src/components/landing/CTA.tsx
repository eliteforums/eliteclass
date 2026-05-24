import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="glass relative overflow-hidden rounded-3xl p-12 text-center shadow-elegant sm:p-16">
          <div className="absolute inset-0 -z-10 bg-gradient-primary opacity-20" />
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Ready to run your institute on <span className="text-gradient">EduOS?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Book a 30-minute demo and see how leading institutes are saving 20+ hours every week.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="bg-gradient-primary text-primary-foreground hover:opacity-90"
            >
              Book your demo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button size="lg" variant="outline">
              Talk to sales
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
