import { motion } from "framer-motion";
import { Brain, FileText, TrendingUp, MessageCircle, Wand2 } from "lucide-react";

const aiCapabilities = [
  {
    icon: TrendingUp,
    title: "Attendance & dropout prediction",
    desc: "Spot at-risk students before they disengage.",
  },
  { icon: Wand2, title: "AI remark generation", desc: "Personalized teacher remarks in seconds." },
  {
    icon: FileText,
    title: "AI paper generation",
    desc: "Generate balanced question papers from your bank.",
  },
  {
    icon: Brain,
    title: "Performance insights",
    desc: "Forecast outcomes and surface weak topics.",
  },
  {
    icon: MessageCircle,
    title: "AI assistant chatbot",
    desc: "Answers admin, staff and parent questions 24/7.",
  },
];

export function AISection() {
  return (
    <section id="ai" className="relative overflow-hidden px-6 py-24">
      <div className="absolute inset-0 -z-10 bg-gradient-primary opacity-10" />
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-accent">AI Layer</p>
            <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              An <span className="text-gradient">intelligent core</span> for your institute
            </h2>
            <p className="mt-4 text-muted-foreground">
              EduOS embeds AI throughout — from spotting at-risk students to drafting question
              papers and recovering pending fees. Less busywork. Better decisions.
            </p>
          </div>

          <div className="space-y-3">
            {aiCapabilities.map((c, i) => (
              <motion.div
                key={c.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="glass flex items-start gap-4 rounded-xl p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-primary">
                  <c.icon className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h3 className="font-semibold">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
