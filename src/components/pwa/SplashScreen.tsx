// ---------------------------------------------------------------------------
// SplashScreen — animated PWA boot loader
// ---------------------------------------------------------------------------
//
// Shows a branded full-screen loader while the app is hydrating. Fades out
// smoothly once the auth store finishes loading.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

interface SplashScreenProps {
  /** Whether app has finished loading (auth resolved, route ready) */
  isReady: boolean;
}

export function SplashScreen({ isReady }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    // Start fade-out animation after a brief pause so it feels intentional
    const fadeTimer = setTimeout(() => setFadeOut(true), 300);
    // Remove from DOM after animation completes
    const removeTimer = setTimeout(() => setVisible(false), 900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [isReady]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0f0f1a] transition-opacity duration-500 ${
        fadeOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Ambient glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-violet-600/20 blur-[120px] animate-pulse" />
        <div className="absolute -bottom-40 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-indigo-600/15 blur-[100px] animate-pulse [animation-delay:0.5s]" />
      </div>

      {/* Logo + text */}
      <div className="relative flex flex-col items-center gap-6 px-8 text-center">
        {/* Logo with ring animation */}
        <div className="relative">
          {/* Spinning outer ring */}
          <div className="absolute inset-0 -m-3 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin [animation-duration:1.2s]" />
          {/* Inner glow ring */}
          <div className="absolute inset-0 -m-1.5 rounded-full border border-violet-400/20 animate-pulse" />
          {/* Logo */}
          <div className="relative h-20 w-20 rounded-2xl overflow-hidden shadow-2xl shadow-violet-900/60 bg-[#1a1a2e]">
            <img
              src="/logo.png"
              alt="EliteClass"
              className="h-full w-full object-contain p-2"
              onError={(e) => {
                // Fallback to SVG if PNG not found
                (e.target as HTMLImageElement).src = "/logo.svg";
              }}
            />
          </div>
        </div>

        {/* Brand name */}
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white">
            Elite<span className="text-violet-400">Class</span>
          </h1>
          <p className="mt-1 text-xs tracking-widest text-violet-300/60 uppercase font-medium">
            AI-Powered Institute Management
          </p>
        </div>

        {/* Animated loading bar */}
        <div className="w-48 h-0.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 via-indigo-400 to-violet-500 bg-[length:200%_100%]"
            style={{
              animation: "shimmer 1.5s ease-in-out infinite",
            }}
          />
        </div>

        {/* Loading dots */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-violet-400/60"
              style={{
                animation: `bounce 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom tagline */}
      <p className="absolute bottom-8 text-xs text-white/20 tracking-widest uppercase">
        by Elite Forums
      </p>

      {/* Inline keyframes (Tailwind doesn't include these by default) */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% center; }
          100% { background-position: -200% center; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
