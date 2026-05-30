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
  Shield,
  FileText,
  Brain,
  Award,
} from "lucide-react";

const features = [
  {
    icon: Users,
    title: "Student Management",
    desc: "Admissions, profiles, batch requests, and lifecycle tracking in one place.",
  },
  {
    icon: CalendarCheck,
    title: "Smart Attendance",
    desc: "Daily session-based tracking for students and staff with batch scoping.",
  },
  {
    icon: Wallet,
    title: "Fee Management",
    desc: "Fee structures, payment tracking, receipts, and real-time revenue analytics.",
  },
  {
    icon: BookOpen,
    title: "Built-in LMS",
    desc: "Courses, modules, lessons, progress tracking, and student self-enrollment.",
  },
  {
    icon: FileText,
    title: "MCQ Exam System",
    desc: "Secure exams with AI question generation from PDFs, proctoring, and auto-grading.",
  },
  {
    icon: Shield,
    title: "Exam Proctoring",
    desc: "Tab detection, camera/mic activation, and deterrent UI for secure assessments.",
  },
  {
    icon: Brain,
    title: "AI-Powered Features",
    desc: "Notes summarization, study tips, lesson plans, doubt solving, and auto-remarks.",
  },
  {
    icon: Award,
    title: "Bulk Certificates",
    desc: "Create templates, select students, and generate professional PDF certificates.",
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    desc: "Live dashboards with AI insights across academics, fees, and operations.",
  },
  {
    icon: MessageSquare,
    title: "Communication",
    desc: "AI-drafted announcements, fee reminders, and parent updates.",
  },
  {
    icon: GraduationCap,
    title: "Batch Management",
    desc: "Student batch requests, instructor approval, and self-service enrollment.",
  },
  {
    icon: Megaphone,
    title: "Settings & Profile",
    desc: "Profile management, password changes, and institute configuration.",
  },
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
            Stop juggling spreadsheets, WhatsApp groups and disconnected tools. EliteClass unifies your
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
