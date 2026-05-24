import { motion } from "framer-motion";
import {
  Users,
  BookOpen,
  Briefcase,
  MessageSquare,
  BarChart3,
  Sparkles,
  CalendarCheck,
  Wallet,
  GraduationCap,
  Megaphone,
  Boxes,
  Trophy,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Student Management",
    desc: "Admissions, profiles, documents and lifecycle tracking in one place.",
  },
  {
    icon: CalendarCheck,
    title: "Smart Attendance",
    desc: "Manual, QR and AI-predicted attendance with absentee alerts.",
  },
  {
    icon: Wallet,
    title: "Fee Management",
    desc: "Plans, installments, online payments and automated reminders.",
  },
  {
    icon: BookOpen,
    title: "Built-in LMS",
    desc: "Lectures, notes, assignments, live classes and doubt solving.",
  },
  {
    icon: Briefcase,
    title: "Admission CRM",
    desc: "Lead pipeline, follow-ups, seminars and conversion analytics.",
  },
  {
    icon: MessageSquare,
    title: "Communication",
    desc: "WhatsApp, SMS, email and push — automated end-to-end.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    desc: "Real-time dashboards across academics, fees and operations.",
  },
  {
    icon: Sparkles,
    title: "AI Automation",
    desc: "Remarks, paper generation, risk analysis and recovery hints.",
  },
  {
    icon: GraduationCap,
    title: "Examinations",
    desc: "Question banks, scheduling, results and AI paper generation.",
  },
  {
    icon: Megaphone,
    title: "Branding Kit",
    desc: "Posters, certificates and social creatives generated for you.",
  },
  {
    icon: Trophy,
    title: "Events & Seminars",
    desc: "Registration, QR check-in, attendance logs and feedback.",
  },
  { icon: Boxes, title: "Inventory", desc: "Stock, asset logs and history across branches." },
];

export function Features() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-accent">Everything you need</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            One platform. <span className="text-gradient">Every workflow.</span>
          </h2>
          <p className="mt-4 text-muted-foreground">
            Stop juggling spreadsheets, WhatsApp groups and disconnected tools. EduOS unifies your
            entire institute.
          </p>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className="glass group rounded-2xl p-6 transition-all hover:border-primary/40 hover:shadow-elegant"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
                <f.icon className="h-5 w-5 text-primary-foreground" />
              </div>
              <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
