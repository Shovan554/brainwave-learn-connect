import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen relative overflow-hidden">
        {/* Educational background pattern */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={
            role === "teacher"
              ? {
                  backgroundImage: `
                    linear-gradient(hsl(var(--primary) / 0.06) 1px, transparent 1px),
                    linear-gradient(90deg, hsl(var(--primary) / 0.06) 1px, transparent 1px),
                    linear-gradient(hsl(var(--primary) / 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, hsl(var(--primary) / 0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
                }
              : {
                  backgroundImage: `
                    linear-gradient(hsl(var(--primary) / 0.08) 1.5px, transparent 1.5px),
                    linear-gradient(90deg, hsl(var(--primary) / 0.08) 1.5px, transparent 1.5px),
                    linear-gradient(hsl(var(--primary) / 0.03) 1px, transparent 1px),
                    linear-gradient(90deg, hsl(var(--primary) / 0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: "80px 80px, 80px 80px, 16px 16px, 16px 16px",
                }
          }
        />
        <div className="relative z-[1] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
