import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useSidebarMobile } from "@/hooks/useSidebarMobile";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import studentBgLight from "@/assets/student-bg-light.jpg";
import studentBgDark from "@/assets/student-bg-dark.jpg";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();
  const { theme } = useTheme();
  const { toggle } = useSidebarMobile();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b border-border/60 bg-background/90 backdrop-blur-md px-4 lg:hidden">
        <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8">
          <Menu className="h-4 w-4" />
        </Button>
        <span className="text-sm font-display font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          BrainWave
        </span>
      </div>

      <main className="lg:ml-64 min-h-screen relative overflow-hidden">
        {/* Educational background pattern */}
        {role === "student" ? (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: `url(${theme === "light" ? studentBgLight : studentBgDark})`,
              backgroundSize: theme === "light" ? "800px" : "cover",
              backgroundRepeat: theme === "light" ? "repeat" : "no-repeat",
              backgroundPosition: "center",
              opacity: theme === "light" ? 0.08 : 0.15,
            }}
          />
        ) : (
          <div
            className="pointer-events-none absolute inset-0 z-0"
            style={{
              backgroundImage: `
                linear-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px),
                linear-gradient(90deg, hsl(var(--primary) / 0.06) 1px, transparent 1px),
                linear-gradient(hsl(var(--primary) / 0.03) 1px, transparent 1px),
                linear-gradient(90deg, hsl(var(--primary) / 0.03) 1px, transparent 1px)
              `,
              backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
            }}
          />
        )}
        <div className="relative z-[1] p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
