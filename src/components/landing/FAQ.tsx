import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    q: "Is EduOS suitable for small coaching institutes?",
    a: "Yes. The Starter plan is designed for institutes with up to 200 students and includes everything you need to digitize daily operations.",
  },
  {
    q: "Can parents and students access the platform?",
    a: "Both have dedicated, mobile-first portals to track attendance, fees, marks, assignments and notices in real time.",
  },
  {
    q: "How does the AI layer work?",
    a: "EduOS uses AI for risk prediction, auto-generated remarks, paper generation and intelligent fee recovery — built into your normal workflows.",
  },
  {
    q: "Is my institute's data isolated and secure?",
    a: "Yes. Multi-tenant architecture with row-level security ensures every institute's data stays fully isolated and encrypted.",
  },
  {
    q: "Does it work offline?",
    a: "EduOS is a Progressive Web App with offline support for attendance and key workflows. It installs like a native app on phones and tablets.",
  },
];

export function FAQ() {
  return (
    <section id="faq" className="px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-medium text-accent">FAQ</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Questions, <span className="text-gradient">answered</span>
          </h2>
        </div>
        <Accordion type="single" collapsible className="mt-12 space-y-3">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="glass rounded-xl border-0 px-5">
              <AccordionTrigger className="text-left hover:no-underline">{f.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
