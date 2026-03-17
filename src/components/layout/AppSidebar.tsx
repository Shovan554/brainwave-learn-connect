import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  BookOpen,
  PlusCircle,
  User,
  LogOut,
  Brain,
  GraduationCap,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  Film,
  Sun,
  Moon,
  Compass,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function AppSidebar() {
  const { role, profile, user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [courses, setCourses] = useState<any[]>([]);
  const [coursesOpen, setCoursesOpen] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (role === "student") {
      supabase
        .from("enrollments")
        .select("course_id, courses(id, title)")
        .eq("student_id", user.id)
        .then(({ data }) => {
          setCourses(data?.map((e: any) => e.courses).filter(Boolean) || []);
        });
    } else if (role === "teacher") {
      supabase
        .from("courses")
        .select("id, title")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setCourses(data || []);
        });
    }
  }, [user, role]);

  const teacherLinks = [
    { to: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/teacher/courses/new", label: "New Course", icon: PlusCircle },
    { to: "/explore", label: "Explore", icon: Compass },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/reels", label: "Reels", icon: Film },
  ];

  const studentLinks = [
    { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/student/grades", label: "Grades", icon: GraduationCap },
    { to: "/student/readings", label: "My Readings", icon: BookOpen },
    { to: "/explore", label: "Explore", icon: Compass },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/reels", label: "Reels", icon: Film },
    { to: "/student/profile", label: "My Profile", icon: User },
  ];

  const links = role === "teacher" ? teacherLinks : studentLinks;

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex h-16 items-center gap-2 px-6 border-b border-sidebar-border">
        <Brain className="h-7 w-7 text-sidebar-primary" />
        <span className="text-lg font-bold tracking-tight">BrainWave</span>
      </div>

      <ScrollArea className="flex-1">
        <nav className="space-y-1 px-3 py-4">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}

          {/* Courses section for both roles */}
          {courses.length > 0 && (
            <div className="pt-3">
              <button
                onClick={() => setCoursesOpen(!coursesOpen)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
              >
                {coursesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {role === "teacher" ? "My Courses" : "My Courses"}
              </button>
              {coursesOpen && (
                <div className="mt-1 space-y-0.5">
                  {courses.map((c: any) => (
                    <NavLink
                      key={c.id}
                      to={role === "teacher" ? `/teacher/courses/${c.id}` : `/student/courses/${c.id}`}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5"
                      activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span className="truncate">{c.title}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {profile?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{profile?.name || "User"}</p>
            <p className="truncate text-xs text-sidebar-foreground/50 capitalize">{role}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-200 mb-1"
          onClick={toggleTheme}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors duration-200"
          onClick={signOut}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
}
