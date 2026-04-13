import { useEffect, useState, useCallback } from "react";
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
  Calendar, Trophy, X, ChevronDown,
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
  const { user, session } = useAuth();
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
  const [todoOpen, setTodoOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
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
      setLoading(false);
      return;
    }

    const courseIds = courseList.map((c: any) => c.id);

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

    const prioritized: PrioritizedAssignment[] = allAssignments
      .filter(a => !submittedIds.has(a.id))
      .map(a => {
        const courseName = courseList.find((c: any) => c.id === a.course_id)?.title || "";
        const dueMs = a.due_date ? new Date(a.due_date).getTime() : now + 30 * 24 * 60 * 60 * 1000;
        const isPastDue = a.due_date && dueMs < now;
        const urgency = isPastDue ? 0.1 : Math.max(1, (dueMs - now) / (1000 * 60 * 60));
        const score = ((a.weight || 1) * (a.points || 1)) / (urgency * Math.max(1, a.estimated_time_minutes || 30));
        return { ...a, course_title: courseName, priority_score: score };
      })
      .sort((a, b) => b.priority_score - a.priority_score);
    setAssignments(prioritized);

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
    setLoading(false);
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
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight">
            My Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">Here's what's happening with your courses today.</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 rounded-lg text-xs font-medium shadow-sm">
              <Plus className="h-3.5 w-3.5" /> Join Course
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-xl">
            <DialogHeader>
              <DialogTitle className="font-display">Join a Course</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Enter invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} className="rounded-lg" />
              <Button onClick={joinCourse} disabled={joining} className="w-full rounded-lg">
                {joining && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Join
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card key={i} className="border border-border">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
                  <div className="space-y-2 flex-1">
                    <div className="h-5 w-12 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-16 bg-muted rounded animate-pulse" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="border border-border">
                <CardContent className="p-4">
                  <div className="h-4 w-32 bg-muted rounded animate-pulse mb-2" />
                  <div className="h-3 w-48 bg-muted rounded animate-pulse" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ── Overdue Alert Banner ── */}
          {pastDue.length > 0 && (
            <div
              className="mb-6 flex items-center gap-3 rounded-lg border-2 border-destructive bg-destructive/10 px-4 py-3 cursor-pointer hover:bg-destructive/15 transition-colors"
              onClick={() => setPastDueOpen(true)}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-destructive">
                  {pastDue.length} overdue assignment{pastDue.length > 1 ? "s" : ""} need{pastDue.length === 1 ? "s" : ""} your attention
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {pastDue[0]?.title}{pastDue.length > 1 ? ` and ${pastDue.length - 1} more` : ""} — click to review
                </p>
              </div>
              <ArrowRight className="h-4 w-4 text-destructive shrink-0" />
            </div>
          )}

          {/* ── AI Suggestion Banner ── */}
          <AIDashboardInsight userToken={session?.access_token ?? null} />

          {/* ── Metrics Strip ── */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-6">
            {/* Past Due */}
            <Card
              className={`cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border-2 ${
                pastDue.length > 0
                  ? "border-destructive/60 bg-destructive/5 shadow-sm shadow-destructive/10"
                  : "border-border"
              }`}
              onClick={() => pastDue.length > 0 && setPastDueOpen(true)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  pastDue.length > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted"
                }`}>
                  <FileWarning className={`h-5 w-5 ${pastDue.length > 0 ? "" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <span className={`text-2xl font-display font-bold ${pastDue.length > 0 ? "text-destructive" : ""}`}>{pastDue.length}</span>
                  <p className="text-xs text-muted-foreground">Past Due</p>
                </div>
              </CardContent>
            </Card>

            {/* Due Soon */}
            <Card
              className="cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border border-border"
              onClick={() => assignments.length > 0 && setDueOpen(true)}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <span className="text-2xl font-display font-bold">{assignments.length}</span>
                  <p className="text-xs text-muted-foreground">Due Soon</p>
                </div>
              </CardContent>
            </Card>

            {/* Submitted */}
            <Card className="transition-all duration-300 hover:shadow-lg hover:scale-105 border border-border">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle className="h-5 w-5 text-success" />
                </div>
                <div>
                  <span className="text-2xl font-display font-bold">{submittedCount}<span className="text-sm text-muted-foreground font-normal">/{totalAssignments}</span></span>
                  <p className="text-xs text-muted-foreground">Submitted</p>
                </div>
              </CardContent>
            </Card>

            {/* Overall Grade */}
            <Card
              className="cursor-pointer transition-all duration-300 hover:shadow-lg hover:scale-105 border border-border"
              onClick={() => navigate("/student/grades")}
            >
              <CardContent className="p-4 flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-warning/10">
                  <Trophy className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <span className="text-2xl font-display font-bold">{overallGpa !== null ? `${overallGpa.toFixed(1)}%` : "—"}</span>
                  <p className="text-xs text-muted-foreground">Overall Grade</p>
                </div>
              </CardContent>
            </Card>
          </div>

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
          <button
            onClick={() => setTodoOpen(v => !v)}
            className="mb-3 flex items-center gap-2 w-full text-left group"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <h2 className="text-base font-display font-semibold">What To Do Next</h2>
            <ChevronDown className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${todoOpen ? "rotate-180" : ""}`} />
          </button>

          {todoOpen && (
            <>
              {assignments.length === 0 ? (
                <Card className="mb-8 border-dashed border-success/30 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                  <CardContent className="flex flex-col items-center py-10 text-center">
                    <CheckCircle className="mb-3 h-10 w-10 text-success/50" />
                    <p className="text-base font-semibold text-foreground">You're all caught up!</p>
                    <p className="mt-1 text-sm text-muted-foreground">No pending assignments — great work.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="mb-8 space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
                  {assignments.slice(0, 5).map((a, i) => {
                    const isPastDue = a.due_date && new Date(a.due_date).getTime() < Date.now();
                    const isUrgent = !isPastDue && a.due_date && (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60) < 24;
                    const isSoon = !isPastDue && a.due_date && (new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60) < 72;
                    return (
                      <Card key={a.id} className={`group transition-all duration-300 hover:shadow-lg hover:scale-[1.02] border ${
                        isPastDue
                          ? "border-destructive/50 bg-destructive/5"
                          : isUrgent
                          ? "border-warning/40 bg-warning/5"
                          : i === 0
                          ? "border-primary/30 bg-primary/5"
                          : "hover:border-primary/20"
                      }`}>
                        <CardContent className="flex items-center justify-between p-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isPastDue && (
                                <Badge variant="destructive" className="text-xs gap-1">
                                  <FileWarning className="h-3 w-3" /> Overdue
                                </Badge>
                              )}
                              {!isPastDue && i === 0 && (
                                <Badge className="bg-primary text-primary-foreground text-xs gap-1">
                                  <Flame className="h-3 w-3" /> Top Priority
                                </Badge>
                              )}
                              {!isPastDue && isUrgent && (
                                <Badge className="bg-warning text-warning-foreground text-xs gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Urgent
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs">
                                {a.due_date ? (
                                  isPastDue ? `Due ${new Date(a.due_date).toLocaleDateString()}` :
                                  isUrgent ? `Due in ${Math.max(1, Math.round((new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60)))}h` :
                                  isSoon ? `Due in ${Math.round((new Date(a.due_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))}d` :
                                  new Date(a.due_date).toLocaleDateString()
                                ) : "No due date"}
                              </Badge>
                            </div>
                            <p className={`mt-1.5 font-medium ${isPastDue ? "text-destructive" : ""}`}>{a.title}</p>
                            <p className="text-xs text-muted-foreground">{a.course_title} · {a.points} pts · ~{a.estimated_time_minutes}min</p>
                          </div>
                          <Button variant="ghost" size="sm" asChild className="rounded-lg shrink-0">
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
            </>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
