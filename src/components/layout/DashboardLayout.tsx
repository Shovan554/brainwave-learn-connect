import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";
import studentBg from "@/assets/student-bg.jpg";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen relative overflow-hidden">
        {/* Educational background pattern */}
        {role === "student" ? (
          <div
            className="pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
            style={{
              backgroundImage: `url(${studentBg})`,
              backgroundSize: "800px",
              backgroundRepeat: "repeat",
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
        <div className="relative z-[1] p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
