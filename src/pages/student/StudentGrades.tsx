import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GraduationCap, BookOpen, Trophy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface GradedSubmission {
  id: string;
  assignment_title: string;
  grade: number | null;
  points: number | null;
  feedback: string | null;
  graded_at: string | null;
  submitted_at: string;
}

interface CourseGrades {
  course_id: string;
  course_title: string;
  submissions: GradedSubmission[];
  average: number | null;
  totalPoints: number;
  earnedPoints: number;
}

export default function StudentGrades() {
  const { user } = useAuth();
  const [courseGrades, setCourseGrades] = useState<CourseGrades[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadGrades();
  }, [user]);

  const loadGrades = async () => {
    // Get enrolled courses
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, courses(id, title)")
      .eq("student_id", user!.id);

    const courseList = enrollments?.map((e: any) => e.courses).filter(Boolean) || [];

    if (courseList.length === 0) {
      setCourseGrades([]);
      setLoading(false);
      return;
    }

    const courseIds = courseList.map((c: any) => c.id);

    // Get all submissions for this student
    const { data: submissions } = await supabase
      .from("assignment_submissions")
      .select("id, assignment_id, grade, feedback, graded_at, submitted_at")
      .eq("student_id", user!.id);

    // Get all assignments for enrolled courses
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, course_id, title, points, is_published")
      .in("course_id", courseIds)
      .eq("is_published", true);

    const grouped: CourseGrades[] = courseList.map((course: any) => {
      const courseAssignments = assignments?.filter((a: any) => a.course_id === course.id) || [];
      const courseSubmissions: GradedSubmission[] = courseAssignments.map((a: any) => {
        const sub = submissions?.find((s: any) => s.assignment_id === a.id);
        return {
          id: a.id,
          assignment_title: a.title,
          grade: sub?.grade ?? null,
          points: a.points,
          feedback: sub?.feedback ?? null,
          graded_at: sub?.graded_at ?? null,
          submitted_at: sub?.submitted_at ?? "",
        };
      });

      const graded = courseSubmissions.filter((s) => s.grade !== null && s.points);
      const earnedPoints = graded.reduce((sum, s) => sum + (s.grade || 0), 0);
      const totalPoints = graded.reduce((sum, s) => sum + (s.points || 0), 0);
      const average = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : null;

      return {
        course_id: course.id,
        course_title: course.title,
        submissions: courseSubmissions,
        average,
        totalPoints,
        earnedPoints,
      };
    });

    setCourseGrades(grouped);
    setLoading(false);
  };

  const gradeColor = (grade: number | null, points: number | null) => {
    if (grade === null || !points) return "secondary";
    const pct = (grade / points) * 100;
    if (pct >= 90) return "default";
    if (pct >= 70) return "secondary";
    return "destructive";
  };

  const averageBadge = (avg: number | null) => {
    if (avg === null) return { label: "No grades", variant: "secondary" as const };
    if (avg >= 90) return { label: `${avg.toFixed(1)}%`, variant: "default" as const };
    if (avg >= 70) return { label: `${avg.toFixed(1)}%`, variant: "secondary" as const };
    return { label: `${avg.toFixed(1)}%`, variant: "destructive" as const };
  };

  return (
    <DashboardLayout>
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Trophy className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">My Grades</h1>
            <p className="text-muted-foreground">View your grades across all courses</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : courseGrades.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <GraduationCap className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No courses enrolled yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {courseGrades.map((cg) => {
            const badge = averageBadge(cg.average);
            return (
              <Card key={cg.course_id} className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{cg.course_title}</CardTitle>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                    <Button variant="ghost" size="sm" asChild className="rounded-xl">
                      <Link to={`/student/courses/${cg.course_id}`}>
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {cg.submissions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No assignments yet</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Assignment</TableHead>
                          <TableHead className="text-right">Grade</TableHead>
                          <TableHead className="text-right">Points</TableHead>
                          <TableHead className="hidden sm:table-cell">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cg.submissions.map((sub) => (
                          <TableRow key={sub.id}>
                            <TableCell className="font-medium">{sub.assignment_title}</TableCell>
                            <TableCell className="text-right">
                              {sub.grade !== null ? (
                                <Badge variant={gradeColor(sub.grade, sub.points)}>
                                  {sub.grade}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {sub.points ?? "—"}
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <Badge variant="outline" className="text-xs">
                                {sub.grade !== null
                                  ? "Graded"
                                  : sub.submitted_at
                                  ? "Submitted"
                                  : "Not submitted"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
