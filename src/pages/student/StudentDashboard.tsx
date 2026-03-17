import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AIDashboardInsight } from "@/components/AIDashboardInsight";
import {
  BookOpen, Clock, ArrowRight, Plus, Loader2, Sparkles,
  GraduationCap, AlertTriangle, Flame, CheckCircle, FileWarning,
  Calendar, Trophy, TrendingUp, X,
} from "lucide-react";

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

interface PastDueAssignment {
  id: string;
  title: string;
  course_title: string;
  course_id: string;
  due_date: string;
  points: number;
}

interface CourseGrade {
  course_id: string;
  course_title: string;
  percentage: number | null;
  earned: number;
  total: number;
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [courses, setCourses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<PrioritizedAssignment[]>([]);
  const [pastDue, setPastDue] = useState<PastDueAssignment[]>([]);
  const [courseGrades, setCourseGrades] = useState<CourseGrade[]>([]);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [totalAssignments, setTotalAssignments] = useState(0);
  const [inviteCode, setInviteCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pastDueOpen, setPastDueOpen] = useState(false);
  const [dueOpen, setDueOpen] = useState(false);

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

    if (courseList.length === 0) {
      setAssignments([]);
      setPastDue([]);
      setCourseGrades([]);
      return;
    }

    const courseIds = courseList.map((c: any) => c.id);

    // Get all assignments + submissions in parallel
    const [assignRes, subRes] = await Promise.all([
      supabase.from("assignments").select("*").in("course_id", courseIds).eq("is_published", true),
      supabase.from("assignment_submissions").select("assignment_id, grade, graded_at").eq("student_id", user!.id),
    ]);

    const allAssignments = assignRes.data || [];
    const allSubmissions = subRes.data || [];
    const submittedIds = new Set(allSubmissions.map(s => s.assignment_id));

    setTotalAssignments(allAssignments.length);
    setSubmittedCount(submittedIds.size);

    const now = Date.now();

    // Past due (not submitted)
    const pastDueList: PastDueAssignment[] = allAssignments
      .filter(a => a.due_date && new Date(a.due_date).getTime() < now && !submittedIds.has(a.id))
      .map(a => ({
        id: a.id,
        title: a.title,
        course_title: courseList.find((c: any) => c.id === a.course_id)?.title || "",
        course_id: a.course_id,
        due_date: a.due_date!,
        points: a.points || 0,
      }))
      .sort((a, b) => new Date(b.due_date).getTime() - new Date(a.due_date).getTime());
    setPastDue(pastDueList);

    // Upcoming (not past due)
    const prioritized: PrioritizedAssignment[] = allAssignments
      .filter(a => {
        if (!a.due_date) return true;
        return new Date(a.due_date).getTime() > now;
      })
      .map(a => {
        const courseName = courseList.find((c: any) => c.id === a.course_id)?.title || "";
        const dueMs = a.due_date ? new Date(a.due_date).getTime() : now + 30 * 24 * 60 * 60 * 1000;
        const urgency = Math.max(1, (dueMs - now) / (1000 * 60 * 60));
        const score = ((a.weight || 1) * (a.points || 1)) / (urgency * Math.max(1, a.estimated_time_minutes || 30));
        return { ...a, course_title: courseName, priority_score: score };
      })
      .sort((a, b) => b.priority_score - a.priority_score);
    setAssignments(prioritized);

    // Course grades
    const grades: CourseGrade[] = courseList.map((course: any) => {
      const courseAssignments = allAssignments.filter(a => a.course_id === course.id);
      const graded = courseAssignments
        .map(a => {
          const sub = allSubmissions.find(s => s.assignment_id === a.id);
          return sub?.grade != null ? { grade: sub.grade, points: a.points || 0 } : null;
        })
        .filter(Boolean) as { grade: number; points: number }[];

      const earned = graded.reduce((s, g) => s + g.grade, 0);
      const total = graded.reduce((s, g) => s + g.points, 0);
      return {
        course_id: course.id,
        course_title: course.title,
        percentage: total > 0 ? (earned / total) * 100 : null,
        earned,
        total,
      };
    });
    setCourseGrades(grades);
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

  const overallGpa = (() => {
    const withGrades = courseGrades.filter(c => c.percentage !== null);
    if (withGrades.length === 0) return null;
    return withGrades.reduce((s, c) => s + c.percentage!, 0) / withGrades.length;
  })();

  return (
    <DashboardLayout>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
          <p className="text-muted-foreground">Your assignments and courses</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 rounded-xl">
              <Plus className="h-4 w-4" /> Join Course
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Join a Course</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input placeholder="Enter invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="rounded-xl" />
              <Button onClick={joinCourse} disabled={joining} className="w-full rounded-xl">
                {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Metrics Strip ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {/* Past Due */}
        <Card
          className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${pastDue.length > 0 ? "border-destructive/40" : ""}`}
          onClick={() => pastDue.length > 0 && setPastDueOpen(true)}
        >
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <FileWarning className={`h-5 w-5 ${pastDue.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              {pastDue.length > 0 && <Badge variant="destructive" className="text-[10px] px-1.5">{pastDue.length}</Badge>}
            </div>
            <span className="text-2xl font-bold">{pastDue.length}</span>
            <span className="text-xs text-muted-foreground">Past Due</span>
          </CardContent>
        </Card>

        {/* Assignments Due */}
        <Card
          className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
          onClick={() => assignments.length > 0 && setDueOpen(true)}
        >
          <CardContent className="p-4 flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <Calendar className="h-5 w-5 text-primary" />
              {assignments.length > 0 && <Badge variant="secondary" className="text-[10px] px-1.5">{assignments.length}</Badge>}
            </div>
            <span className="text-2xl font-bold">{assignments.length}</span>
            <span className="text-xs text-muted-foreground">Due Soon</span>
          </CardContent>
        </Card>

        {/* Submitted */}
        <Card className="transition-all hover:shadow-md hover:-translate-y-0.5">
          <CardContent className="p-4 flex flex-col gap-1">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <span className="text-2xl font-bold">{submittedCount}<span className="text-sm text-muted-foreground font-normal">/{totalAssignments}</span></span>
            <span className="text-xs text-muted-foreground">Submitted</span>
          </CardContent>
        </Card>

        {/* Overall Grade */}
        <Card
          className="cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5"
          onClick={() => navigate("/student/grades")}
        >
          <CardContent className="p-4 flex flex-col gap-1">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span className="text-2xl font-bold">{overallGpa !== null ? `${overallGpa.toFixed(1)}%` : "—"}</span>
            <span className="text-xs text-muted-foreground">Overall Grade</span>
          </CardContent>
        </Card>
      </div>

      {/* ── Course Grade Bars ── */}
      {courseGrades.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Course Grades</h2>
          </div>
          <Card>
            <CardContent className="p-4 space-y-4">
              {courseGrades.map(cg => (
                <div
                  key={cg.course_id}
                  className="cursor-pointer group"
                  onClick={() => navigate("/student/grades")}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium group-hover:text-primary transition-colors">{cg.course_title}</span>
                    <span className="text-sm font-semibold">
                      {cg.percentage !== null ? `${cg.percentage.toFixed(1)}%` : "No grades"}
                    </span>
                  </div>
                  <Progress
                    value={cg.percentage ?? 0}
                    className="h-2.5"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Past Due Dialog ── */}
      <Dialog open={pastDueOpen} onOpenChange={setPastDueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileWarning className="h-5 w-5 text-destructive" /> Past Due Assignments
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {pastDue.map(a => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border border-destructive/20 bg-destructive/5 p-3 cursor-pointer hover:bg-destructive/10 transition-colors"
                onClick={() => { setPastDueOpen(false); navigate(`/student/courses/${a.course_id}/assignments/${a.id}`); }}
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.course_title} · {a.points} pts</p>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <Badge variant="destructive" className="text-[10px]">
                    {new Date(a.due_date).toLocaleDateString()}
                  </Badge>
                </div>
              </div>
            ))}
            {pastDue.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No past due assignments 🎉</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Due Soon Dialog ── */}
      <Dialog open={dueOpen} onOpenChange={setDueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Upcoming Assignments
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {assignments.map(a => {
              const hours = a.due_date ? (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60) : null;
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => { setDueOpen(false); navigate(`/student/courses/${a.course_id}/assignments/${a.id}`); }}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.course_title} · {a.points} pts · ~{a.estimated_time_minutes}min</p>
                  </div>
                  <Badge variant={urgencyColor(a) as any} className="text-[10px] shrink-0 ml-3">
                    {a.due_date
                      ? hours !== null && hours < 24
                        ? `${Math.max(1, Math.round(hours))}h`
                        : hours !== null && hours < 72
                        ? `${Math.round(hours / 24)}d`
                        : new Date(a.due_date).toLocaleDateString()
                      : "No date"}
                  </Badge>
                </div>
              );
            })}
            {assignments.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No upcoming assignments 🎉</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Priority Queue */}
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">What To Do Next</h2>
      </div>

      {assignments.length === 0 ? (
        <Card className="mb-8 border-dashed bg-gradient-to-br from-green-500/5 to-emerald-500/5 border-green-500/20">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <GraduationCap className="mb-3 h-12 w-12 text-green-500/60" />
            <p className="text-base font-semibold text-foreground">You're all clear! 🎉</p>
            <p className="mt-1 text-sm text-muted-foreground">No upcoming assignments — enjoy your free time</p>
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 space-y-2">
          {assignments.slice(0, 5).map((a, i) => {
            const isUrgent = a.due_date && (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60) < 24;
            const isSoon = a.due_date && (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60) < 72;
            return (
              <Card key={a.id} className={`group transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 ${
                i === 0
                  ? "border-destructive/50 bg-gradient-to-r from-destructive/8 via-destructive/4 to-transparent shadow-sm shadow-destructive/10"
                  : i === 1
                  ? "border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-transparent"
                  : "hover:border-primary/20"
              }`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {i === 0 && (
                        <Badge className="bg-destructive text-destructive-foreground text-xs gap-1">
                          <Flame className="h-3 w-3" /> Top Priority
                        </Badge>
                      )}
                      {i === 1 && (
                        <Badge className="bg-orange-500 text-white text-xs gap-1">
                          <AlertTriangle className="h-3 w-3" /> High
                        </Badge>
                      )}
                      {i === 2 && (
                        <Badge variant="secondary" className="text-xs gap-1">
                          <Sparkles className="h-3 w-3" /> Medium
                        </Badge>
                      )}
                      <Badge variant={urgencyColor(a) as any} className="text-xs">
                        {a.due_date ? (
                          isUrgent ? `Due in ${Math.max(1, Math.round((new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60)))}h` :
                          isSoon ? `Due in ${Math.round((new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d` :
                          new Date(a.due_date).toLocaleDateString()
                        ) : "No due date"}
                      </Badge>
                    </div>
                    <p className={`mt-1.5 font-medium ${i === 0 ? "text-destructive dark:text-red-400" : ""}`}>{a.title}</p>
                    <p className="text-xs text-muted-foreground">{a.course_title} · {a.points} pts · ~{a.estimated_time_minutes}min</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild className="rounded-xl">
                    <Link to={`/student/courses/${a.course_id}/assignments/${a.id}`}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Courses */}
      <div className="mb-3 flex items-center gap-2">
        <GraduationCap className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">My Courses</h2>
      </div>

      {courses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="mb-2 text-sm text-muted-foreground">No courses yet</p>
            <p className="text-xs text-muted-foreground">Join a course using an invite code from your teacher</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((c: any) => (
            <Card key={c.id} className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer border-transparent hover:border-primary/20">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-accent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{c.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{c.term}</p>
              </CardHeader>
              <CardContent>
                <Button variant="outline" size="sm" asChild className="w-full rounded-xl group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300">
                  <Link to={`/student/courses/${c.id}`}>
                    View Course <ArrowRight className="ml-2 h-3 w-3 transition-transform duration-300 group-hover:translate-x-1" />
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
