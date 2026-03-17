import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BookOpen, Users, AlertTriangle, PlusCircle, ArrowRight, ClipboardCheck, Clock, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface UngradedSubmission {
  id: string;
  student_name: string;
  assignment_title: string;
  course_title: string;
  course_id: string;
  submitted_at: string;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState({ courses: 0, students: 0, reports: 0 });
  const [ungradedSubs, setUngradedSubs] = useState<UngradedSubmission[]>([]);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: coursesData } = await supabase
        .from("courses")
        .select("*, enrollments(count), content_reports(count)")
        .eq("teacher_id", user.id)
        .order("created_at", { ascending: false });

      if (coursesData) {
        setCourses(coursesData);
        const totalStudents = coursesData.reduce((sum: number, c: any) => sum + (c.enrollments?.[0]?.count || 0), 0);
        const totalReports = coursesData.reduce((sum: number, c: any) => sum + (c.content_reports?.[0]?.count || 0), 0);
        setStats({ courses: coursesData.length, students: totalStudents, reports: totalReports });

        // Fetch ungraded submissions across all teacher's courses
        const courseIds = coursesData.map((c: any) => c.id);
        if (courseIds.length > 0) {
          const { data: assignments } = await supabase
            .from("assignments")
            .select("id, title, course_id")
            .in("course_id", courseIds);

          if (assignments && assignments.length > 0) {
            const assignmentIds = assignments.map(a => a.id);
            const { data: subs } = await supabase
              .from("assignment_submissions")
              .select("id, assignment_id, student_id, submitted_at")
              .in("assignment_id", assignmentIds)
              .is("grade", null)
              .order("submitted_at", { ascending: true });

            if (subs && subs.length > 0) {
              const studentIds = [...new Set(subs.map(s => s.student_id))];
              const { data: profiles } = await supabase
                .from("profiles")
                .select("user_id, name")
                .in("user_id", studentIds);

              const profileMap = new Map((profiles || []).map(p => [p.user_id, p.name]));
              const assignmentMap = new Map(assignments.map(a => [a.id, a]));
              const courseMap = new Map(coursesData.map((c: any) => [c.id, c.title]));

              const mapped: UngradedSubmission[] = subs.map(s => {
                const assignment = assignmentMap.get(s.assignment_id);
                return {
                  id: s.id,
                  student_name: profileMap.get(s.student_id) || "Unknown",
                  assignment_title: assignment?.title || "Unknown",
                  course_title: courseMap.get(assignment?.course_id || "") || "Unknown",
                  course_id: assignment?.course_id || "",
                  submitted_at: s.submitted_at,
                };
              });
              setUngradedSubs(mapped);
            }
          }
        }
      }
    };
    load();
  }, [user]);

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Manage your courses and students</p>
        </div>
        <Button asChild>
          <Link to="/teacher/courses/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Course
          </Link>
        </Button>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.courses}</p>
              <p className="text-sm text-muted-foreground">Courses</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.students}</p>
              <p className="text-sm text-muted-foreground">Students</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
              <AlertTriangle className="h-6 w-6 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.reports}</p>
              <p className="text-sm text-muted-foreground">Reports</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Grading Section */}
      {ungradedSubs.length > 0 && (
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Needs Your Attention</h2>
            <Badge variant="destructive" className="ml-1">{ungradedSubs.length} ungraded</Badge>
          </div>
          <div className="space-y-2">
            {ungradedSubs.slice(0, 8).map((sub) => {
              const daysAgo = Math.floor((Date.now() - new Date(sub.submitted_at).getTime()) / (1000 * 60 * 60 * 24));
              return (
                <Card key={sub.id} className="transition-shadow hover:shadow-md">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-destructive/10">
                        <ClipboardCheck className="h-4 w-4 text-destructive" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{sub.student_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {sub.assignment_title} · {sub.course_title}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {daysAgo === 0 ? "Today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`}
                      </div>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/teacher/courses/${sub.course_id}?tab=assignments`}>
                          Grade <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {ungradedSubs.length > 8 && (
              <p className="text-center text-sm text-muted-foreground">
                +{ungradedSubs.length - 8} more submissions awaiting grading
              </p>
            )}
          </div>
        </div>
      )}

      <h2 className="mb-4 text-lg font-semibold">Your Courses</h2>
      {courses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <BookOpen className="mb-4 h-12 w-12 text-muted-foreground/40" />
            <p className="mb-2 text-lg font-medium">No courses yet</p>
            <p className="mb-4 text-sm text-muted-foreground">Create your first course to get started</p>
            <Button asChild>
              <Link to="/teacher/courses/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Course
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="transition-shadow hover:shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{course.title}</CardTitle>
                <p className="text-xs text-muted-foreground">{course.term}</p>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex gap-4 text-sm text-muted-foreground">
                  <span>{course.enrollments?.[0]?.count || 0} students</span>
                  <span>Code: {course.invite_code}</span>
                </div>
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link to={`/teacher/courses/${course.id}`}>
                    Manage <ArrowRight className="ml-2 h-3 w-3" />
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
