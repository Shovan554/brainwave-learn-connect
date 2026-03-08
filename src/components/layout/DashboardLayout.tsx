import { AppSidebar } from "./AppSidebar";
import { useAuth } from "@/hooks/useAuth";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { role } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 min-h-screen relative">
        {/* Subtle educational background pattern */}
        <div
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.07]"
          style={{
            backgroundImage:
              role === "teacher"
                ? `url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23666' stroke-width='0.8'%3E%3Crect x='5' y='5' width='50' height='35' rx='3'/%3E%3Cline x1='5' y1='15' x2='55' y2='15'/%3E%3Cline x1='15' y1='5' x2='15' y2='15'/%3E%3Ccircle cx='10' cy='10' r='2'/%3E%3Ccircle cx='30' cy='50' r='4'/%3E%3Cpath d='M26 50 L30 44 L34 50'/%3E%3Cline x1='45' y1='25' x2='45' y2='35'/%3E%3Cline x1='40' y1='30' x2='50' y2='30'/%3E%3C/g%3E%3C/svg%3E")`
                : `url("data:image/svg+xml,%3Csvg width='80' height='80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23666' stroke-width='0.7'%3E%3Cline x1='0' y1='40' x2='80' y2='40'/%3E%3Cline x1='40' y1='0' x2='40' y2='80'/%3E%3Cline x1='0' y1='20' x2='80' y2='20' stroke-dasharray='2 4'/%3E%3Cline x1='0' y1='60' x2='80' y2='60' stroke-dasharray='2 4'/%3E%3Cline x1='20' y1='0' x2='20' y2='80' stroke-dasharray='2 4'/%3E%3Cline x1='60' y1='0' x2='60' y2='80' stroke-dasharray='2 4'/%3E%3Ccircle cx='40' cy='40' r='3'/%3E%3Cpath d='M10 65 Q25 20 50 35 T75 15' stroke-width='1'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundRepeat: "repeat",
          }}
        />
        <div className="relative p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
