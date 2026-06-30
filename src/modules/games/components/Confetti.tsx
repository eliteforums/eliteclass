// ---------------------------------------------------------------------------
// Confetti — tiny dependency-free particle burst for perfect-score celebrations
// ---------------------------------------------------------------------------
// Uses CSS animations + dynamic inline styles. No canvas, no library, no
// extra bundle weight. Fires once when the `trigger` prop changes.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";

interface Piece {
  id: number;
  left: number;
  bg: string;
  delay: number;
  rotate: number;
  duration: number;
}

const COLORS = [
  "#f43f5e",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#facc15",
];

export function Confetti({ trigger, count = 36 }: { trigger: unknown; count?: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);

  useEffect(() => {
    const next: Piece[] = Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      bg: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 250,
      rotate: Math.random() * 360,
      duration: 1400 + Math.random() * 1100,
    }));
    setPieces(next);
    const timeout = window.setTimeout(() => setPieces([]), 2800);
    return () => window.clearTimeout(timeout);
  }, [trigger, count]);

  if (pieces.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 size-2 rounded-sm"
          style={{
            left: `${p.left}%`,
            background: p.bg,
            transform: `rotate(${p.rotate}deg)`,
            animation: `confetti-fall ${p.duration}ms ${p.delay}ms cubic-bezier(0.25, 1, 0.5, 1) forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translate3d(0, -10%, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate3d(${(Math.random() - 0.5) * 80}px, 110vh, 0) rotate(720deg); opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
