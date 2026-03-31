import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { NavLink } from "@/components/NavLink";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "@/components/NotificationBell";
import { useSidebarMobile } from "@/hooks/useSidebarMobile";
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
  CalendarDays,
  BarChart3,
  X,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SidebarSection {
  label: string;
  links: { to: string; label: string; icon: any }[];
}

function SectionGroup({ section, defaultOpen = true }: { section: SidebarSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {section.label}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {section.links.map((link) => (
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
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { role, profile, user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isOpen, close } = useSidebarMobile();
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

  const teacherSections: SidebarSection[] = [
    {
      label: "Overview",
      links: [
        { to: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/teacher/courses/new", label: "New Course", icon: PlusCircle },
        { to: "/calendar", label: "Calendar", icon: CalendarDays },
        { to: "/analytics", label: "Analytics", icon: BarChart3 },
      ],
    },
    {
      label: "Discover",
      links: [
        { to: "/explore", label: "Explore", icon: Compass },
        { to: "/reels", label: "Reels", icon: Film },
      ],
    },
    {
      label: "Communication",
      links: [
        { to: "/messages", label: "Messages", icon: MessageCircle },
      ],
    },
  ];

  const studentSections: SidebarSection[] = [
    {
      label: "Overview",
      links: [
        { to: "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { to: "/calendar", label: "Calendar", icon: CalendarDays },
        { to: "/analytics", label: "Analytics", icon: BarChart3 },
        { to: "/student/grades", label: "Grades", icon: GraduationCap },
      ],
    },
    {
      label: "Discover",
      links: [
        { to: "/student/readings", label: "My Readings", icon: BookOpen },
        { to: "/explore", label: "Explore", icon: Compass },
        { to: "/reels", label: "Reels", icon: Film },
      ],
    },
    {
      label: "Communication",
      links: [
        { to: "/messages", label: "Messages", icon: MessageCircle },
      ],
    },
  ];

  const sections = role === "teacher" ? teacherSections : studentSections;

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={close}
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-50 flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-xl transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/20">
              <Brain className="h-5 w-5 text-sidebar-primary" />
            </div>
            <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-sidebar-primary to-accent bg-clip-text text-transparent">
              BrainWave
            </span>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent"
              onClick={close}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <nav className="px-3 py-2">
            {sections.map((section) => (
              <SectionGroup key={section.label} section={section} />
            ))}

            {courses.length > 0 && (
              <div className="pt-2">
                <button
                  onClick={() => setCoursesOpen(!coursesOpen)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 transition-colors hover:text-sidebar-foreground/80"
                >
                  {coursesOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  My Courses
                </button>
                {coursesOpen && (
                  <div className="mt-0.5 space-y-0.5">
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
          <NavLink
            to="/student/profile"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:translate-x-0.5 mb-2"
            activeClassName="bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white">
              {profile?.name?.charAt(0)?.toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{profile?.name || "User"}</p>
            </div>
          </NavLink>
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
    </>
  );
}
