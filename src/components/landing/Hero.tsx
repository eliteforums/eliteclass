import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import dashboardImg from "@/assets/dashboard-preview.jpg";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-6 pt-16 pb-24 sm:pt-24">
      <div className="mx-auto max-w-6xl text-center">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-4 py-1.5 text-xs text-muted-foreground backdrop-blur"
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          AI-powered Educational Operating System
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.05 }}
          className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl"
        >
          The Operating System
          <br />
          for <span className="text-gradient">modern institutes</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground"
        >
          ERP, LMS, CRM, communication and AI automation — unified into one ecosystem. Built for
          coaching institutes, schools and academies that want to scale.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.25 }}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link to="/auth/register-institute">
            <Button
              size="lg"
              className="bg-gradient-primary text-primary-foreground shadow-elegant hover:opacity-90"
            >
              Get started free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/auth/login">
            <Button
              size="lg"
              variant="outline"
              className="border-border bg-surface/60 backdrop-blur"
            >
              Sign in
            </Button>
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.35 }}
        className="relative mx-auto mt-20 max-w-6xl"
      >
        <div className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-primary opacity-30 blur-3xl" />
        <div className="overflow-hidden rounded-2xl border border-border shadow-elegant">
          <img
            src={dashboardImg}
            alt="EduOS dashboard preview"
            width={1920}
            height={1080}
            className="w-full"
          />
        </div>
      </motion.div>
    </section>
  );
}
