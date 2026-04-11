import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles, BookOpen, Lightbulb, Zap, Brain, Rocket, Star } from "lucide-react";

interface GeneratedReelCardProps {
  title: string;
  hook: string;
  script: string;
  colorTheme: string;
  isActive: boolean;
}

const THEME_STYLES: Record<string, {
  bg1: string; bg2: string; bg3: string;
  accent: string; particle: string; glow: string;
}> = {
  blue: {
    bg1: "#1e3a8a", bg2: "#3b82f6", bg3: "#0f172a",
    accent: "#93c5fd", particle: "#60a5fa", glow: "rgba(59,130,246,0.3)",
  },
  purple: {
    bg1: "#581c87", bg2: "#a855f7", bg3: "#1e1b4b",
    accent: "#c4b5fd", particle: "#a78bfa", glow: "rgba(168,85,247,0.3)",
  },
  green: {
    bg1: "#064e3b", bg2: "#10b981", bg3: "#022c22",
    accent: "#6ee7b7", particle: "#34d399", glow: "rgba(16,185,129,0.3)",
  },
  orange: {
    bg1: "#7c2d12", bg2: "#f97316", bg3: "#431407",
    accent: "#fdba74", particle: "#fb923c", glow: "rgba(249,115,22,0.3)",
  },
  red: {
    bg1: "#7f1d1d", bg2: "#ef4444", bg3: "#450a0a",
    accent: "#fca5a5", particle: "#f87171", glow: "rgba(239,68,68,0.3)",
  },
  pink: {
    bg1: "#831843", bg2: "#ec4899", bg3: "#500724",
    accent: "#f9a8d4", particle: "#f472b6", glow: "rgba(236,72,153,0.3)",
  },
};

const ICONS = [Lightbulb, Zap, Brain, Rocket, Star, BookOpen];

export function GeneratedReelCard({ title, hook, script, colorTheme, isActive }: GeneratedReelCardProps) {
  const theme = THEME_STYLES[colorTheme] || THEME_STYLES.blue;
  const [visibleLines, setVisibleLines] = useState(0);
  const scriptLines = script.split("\n").filter(l => l.trim());

  // Staggered text reveal when active
  useEffect(() => {
    if (!isActive) {
      setVisibleLines(0);
      return;
    }
    setVisibleLines(0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    scriptLines.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 800 + i * 400));
    });
    return () => timers.forEach(clearTimeout);
  }, [isActive, scriptLines.length]);

  // Generate deterministic floating particles
  const particles = Array.from({ length: 12 }, (_, i) => {
    const IconComp = ICONS[i % ICONS.length];
    const size = 12 + (i % 3) * 6;
    const left = (i * 23 + 7) % 100;
    const top = (i * 31 + 13) % 100;
    const delay = (i * 0.7) % 4;
    const duration = 4 + (i % 3) * 2;
    return { IconComp, size, left, top, delay, duration, i };
  });

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.bg3 }}>
      {/* Animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 20% 50%, ${theme.bg2}40 0%, transparent 50%),
            radial-gradient(ellipse at 80% 20%, ${theme.bg1}60 0%, transparent 50%),
            radial-gradient(ellipse at 50% 80%, ${theme.bg2}30 0%, transparent 50%),
            linear-gradient(135deg, ${theme.bg3}, ${theme.bg1})
          `,
          animation: isActive ? "genReelBgShift 8s ease-in-out infinite" : "none",
        }}
      />

      {/* Floating glow orbs */}
      <div
        className="absolute w-64 h-64 rounded-full opacity-20 blur-3xl"
        style={{
          background: theme.bg2,
          top: "10%", left: "-10%",
          animation: isActive ? "genReelFloat1 6s ease-in-out infinite" : "none",
        }}
      />
      <div
        className="absolute w-48 h-48 rounded-full opacity-15 blur-3xl"
        style={{
          background: theme.accent,
          bottom: "10%", right: "-5%",
          animation: isActive ? "genReelFloat2 7s ease-in-out infinite" : "none",
        }}
      />

      {/* Floating icon particles */}
      {particles.map(({ IconComp, size, left, top, delay, duration, i }) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: `${left}%`,
            top: `${top}%`,
            opacity: isActive ? 0.12 : 0,
            transition: "opacity 0.5s",
            animation: isActive
              ? `genReelParticle ${duration}s ease-in-out ${delay}s infinite`
              : "none",
          }}
        >
          <IconComp style={{ width: size, height: size, color: theme.particle }} />
        </div>
      ))}

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col h-full p-6">
        {/* Top badge */}
        <div className="flex items-center justify-between mb-auto">
          <Badge
            className="border-0 gap-1.5 text-[10px] font-semibold tracking-wider uppercase backdrop-blur-md"
            style={{ background: `${theme.bg2}30`, color: theme.accent }}
          >
            <Sparkles className="h-3 w-3" style={{ animation: isActive ? "genReelSpin 3s linear infinite" : "none" }} />
            AI Generated
          </Badge>
        </div>

        {/* Center content */}
        <div className="flex-1 flex flex-col justify-center items-center text-center gap-4 py-8">
          {/* Hook with glassmorphism */}
          <div
            className="rounded-2xl px-5 py-3 backdrop-blur-md max-w-[90%]"
            style={{
              background: `${theme.bg2}15`,
              border: `1px solid ${theme.accent}20`,
              opacity: isActive ? 1 : 0.5,
              transform: isActive ? "translateY(0) scale(1)" : "translateY(10px) scale(0.95)",
              transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <p
              className="text-base font-bold italic leading-snug"
              style={{ color: theme.accent }}
            >
              "{hook}"
            </p>
          </div>

          {/* Title */}
          <h2
            className="text-xl font-extrabold text-white leading-tight max-w-[95%]"
            style={{
              opacity: isActive ? 1 : 0.3,
              transform: isActive ? "translateY(0)" : "translateY(15px)",
              transition: "all 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s",
              textShadow: `0 2px 20px ${theme.glow}`,
            }}
          >
            {title}
          </h2>

          {/* Script lines with staggered reveal */}
          <div className="space-y-2 max-w-[90%] mt-2">
            {scriptLines.map((line, i) => (
              <div
                key={i}
                className="rounded-xl px-4 py-2 backdrop-blur-sm text-left"
                style={{
                  background: `${theme.bg2}10`,
                  border: `1px solid ${theme.accent}10`,
                  opacity: i < visibleLines ? 1 : 0,
                  transform: i < visibleLines ? "translateX(0)" : "translateX(-20px)",
                  transition: `all 0.5s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05}s`,
                }}
              >
                <p className="text-xs text-white/80 leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="mt-auto flex justify-center">
          <div
            className="h-1 rounded-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${theme.accent}, transparent)`,
              width: isActive ? "60%" : "20%",
              opacity: isActive ? 0.5 : 0.2,
              transition: "all 1s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
