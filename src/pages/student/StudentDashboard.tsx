import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { BookOpen, Clock, ArrowRight, Plus, Loader2 } from "lucide-react";

interface PrioritizedAssignment {
  id: string;
  title: string;
  course_title: string;
  course_id: string;
  due_date: string | null;
  points: number;
  weight: number;
  estimated_time_minutes: number;
  priority_score: number;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<PrioritizedAssignment[]>([]);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    // Get enrolled courses
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, courses(id, title, term, invite_code)")
      .eq("student_id", user!.id);

    const courseList = enrollments?.map((e: any) => e.courses).filter(Boolean) || [];
    setCourses(courseList);

    // Get all assignments from enrolled courses
    if (courseList.length > 0) {
      const courseIds = courseList.map((c: any) => c.id);
      const { data: assignData } = await supabase
        .from("assignments")
        .select("*")
        .in("course_id", courseIds)
        .eq("is_published", true);

      if (assignData) {
        const now = Date.now();
        const prioritized: PrioritizedAssignment[] = assignData
          .map((a: any) => {
            const courseName = courseList.find((c: any) => c.id === a.course_id)?.title || "";
            const dueMs = a.due_date ? new Date(a.due_date).getTime() : now + 30 * 24 * 60 * 60 * 1000;
            const urgency = Math.max(1, (dueMs - now) / (1000 * 60 * 60));
            const score = ((a.weight || 1) * (a.points || 1)) / (urgency * Math.max(1, a.estimated_time_minutes || 30));
            return { ...a, course_title: courseName, priority_score: score };
          })
          .sort((a: PrioritizedAssignment, b: PrioritizedAssignment) => b.priority_score - a.priority_score);
        setAssignments(prioritized);
      }
    }
  };

  const joinCourse = async () => {
    if (!user || !inviteCode.trim()) return;
    setJoining(true);
    const { data: courseId } = await supabase
      .rpc("get_course_id_by_invite_code", { _code: inviteCode.trim() });

    if (!courseId) {
      toast({ title: "Invalid code", description: "No course found with that invite code", variant: "destructive" });
      setJoining(false);
      return;
    }

    const { error } = await supabase
      .from("enrollments")
      .insert({ course_id: courseId, student_id: user.id });

    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Already enrolled" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Enrolled!" });
      setDialogOpen(false);
      setInviteCode("");
      loadData();
    }
    setJoining(false);
  };

  const urgencyColor = (a: PrioritizedAssignment) => {
    if (!a.due_date) return "secondary";
    const hours = (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60);
    if (hours < 24) return "destructive";
    if (hours < 72) return "default";
    return "secondary";
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground">Your assignments and courses</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Join Course
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join a Course</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Enter invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
              <Button onClick={joinCourse} disabled={joining} className="w-full">
                {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Priority Queue */}
      <h2 className="mb-3 text-lg font-semibold">What To Do Next</h2>
      {assignments.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <Clock className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No upcoming assignments</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 space-y-2">
          {assignments.slice(0, 5).map((a, i) => (
            <Card key={a.id} className={`transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${i === 0 ? "border-primary/30 bg-primary/5" : ""}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {i === 0 && <Badge className="bg-primary text-primary-foreground text-xs">Top Priority</Badge>}
                    <Badge variant={urgencyColor(a)} className="text-xs">
                      {a.due_date ? new Date(a.due_date).toLocaleDateString() : "No due date"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.course_title} · {a.points} pts · ~{a.estimated_time_minutes}min</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/student/courses/${a.course_id}`}>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Courses */}
      <h2 className="mb-3 text-lg font-semibold">My Courses</h2>
      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-8 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="mb-2 text-sm text-muted-foreground">No courses yet</p>
            <p className="text-xs text-muted-foreground">Join a course using an invite code from your teacher</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c: any) => (
            <Card key={c.id} className="transition-all duration-200 hover:shadow-lg hover:-translate-y-1 group cursor-pointer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{c.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{c.term}</p>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-200">
                  <Link to={`/student/courses/${c.id}`}>
                    View Course <ArrowRight className="ml-2 h-3 w-3 transition-transform duration-200 group-hover:translate-x-1" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
