import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useSidebarMobile } from "@/hooks/useSidebarMobile";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import brainwaveIcon from "@/assets/brainwave-icon.png";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { theme } = useTheme();
  const { toggle, collapsed } = useSidebarMobile();

  const mainMargin = collapsed ? "lg:ml-16" : "lg:ml-64";

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />

      {/* Mobile top bar */}
      <div className={`sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border/60 bg-background/90 backdrop-blur-md px-4 lg:hidden`}>
        <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
          <Menu className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <img src={brainwaveIcon} alt="BrainWave" className="h-6 w-6 rounded-md" />
          <span className="text-sm font-display font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            BrainWave
          </span>
        </div>
      </div>

      <main className={`${mainMargin} min-h-screen relative overflow-hidden transition-all duration-300`}>
        {/* Clean subtle background - no doodles */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: theme === "light"
              ? "linear-gradient(to bottom, hsl(var(--background)), hsl(210 20% 96%))"
              : "linear-gradient(to bottom, hsl(var(--background)), hsl(250 20% 6%))",
            opacity: 1,
          }}
        />
        <div className="relative z-[1] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
