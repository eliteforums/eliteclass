import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const tiers = [
  {
    name: "Starter",
    price: "₹4,999",
    suffix: "/mo",
    desc: "For small coaching centers getting started.",
    features: [
      "Up to 200 students",
      "Attendance & fees",
      "WhatsApp reminders",
      "Parent portal",
      "Email support",
    ],
  },
  {
    name: "Growth",
    price: "₹12,999",
    suffix: "/mo",
    desc: "For growing institutes that need automation.",
    features: [
      "Up to 1,500 students",
      "Full LMS + CRM",
      "AI remarks & insights",
      "Multi-branch",
      "Priority support",
    ],
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    suffix: "",
    desc: "For multi-institute groups and universities.",
    features: [
      "Unlimited students",
      "All AI modules",
      "Dedicated success manager",
      "SSO & custom roles",
      "SLA & on-premise",
    ],
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-accent">Pricing</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Plans that <span className="text-gradient">scale with you</span>
          </h2>
          <p className="mt-4 text-muted-foreground">Simple, transparent pricing. Cancel anytime.</p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`glass relative rounded-2xl p-8 ${
                t.highlight ? "border-primary/50 shadow-elegant" : ""
              }`}
            >
              {t.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                  Most popular
                </div>
              )}
              <h3 className="text-lg font-semibold">{t.name}</h3>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-semibold">{t.price}</span>
                <span className="text-muted-foreground">{t.suffix}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t.desc}</p>
              <Button
                className={`mt-6 w-full ${
                  t.highlight ? "bg-gradient-primary text-primary-foreground hover:opacity-90" : ""
                }`}
                variant={t.highlight ? "default" : "outline"}
              >
                Get started
              </Button>
              <ul className="mt-8 space-y-3">
                {t.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 text-accent" />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
