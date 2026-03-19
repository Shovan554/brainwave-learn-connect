import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, BookOpen, CheckCircle, Clock, Award, Target,
} from "lucide-react";
import { format, parseISO } from "date-fns";

const CHART_COLORS = [
  "hsl(230, 65%, 52%)",
  "hsl(262, 52%, 55%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
];

export default function Analytics() {
  const { user, role } = useAuth();
  const [loading, setLoading] = useState(true);
  const [courseGrades, setCourseGrades] = useState<any[]>([]);
  const [submissionStats, setSubmissionStats] = useState<any[]>([]);
  const [overallStats, setOverallStats] = useState({ totalAssignments: 0, submitted: 0, graded: 0, avgGrade: 0 });
  const [gradeTrend, setGradeTrend] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    if (role === "student") fetchStudentAnalytics();
    else fetchTeacherAnalytics();
  }, [user, role]);

  const fetchStudentAnalytics = async () => {
    setLoading(true);

    // Get enrolled courses
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id, courses(id, title)")
      .eq("student_id", user!.id);

    if (!enrollments?.length) { setLoading(false); return; }

    const courseIds = enrollments.map((e: any) => e.course_id);
    const courseMap: Record<string, string> = {};
    enrollments.forEach((e: any) => { if (e.courses) courseMap[e.course_id] = e.courses.title; });

    // Get all assignments for enrolled courses
    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, course_id, points, weight, due_date")
      .in("course_id", courseIds)
      .eq("is_published", true);

    // Get all submissions
    const { data: submissions } = await supabase
      .from("assignment_submissions")
      .select("id, assignment_id, grade, graded_at, submitted_at")
      .eq("student_id", user!.id);

    const assignmentList = assignments || [];
    const submissionList = submissions || [];
    const submissionMap = new Map(submissionList.map((s: any) => [s.assignment_id, s]));

    // Overall stats
    const submitted = assignmentList.filter((a: any) => submissionMap.has(a.id)).length;
    const graded = submissionList.filter((s: any) => s.grade !== null).length;
    const gradedGrades = submissionList.filter((s: any) => s.grade !== null).map((s: any) => Number(s.grade));
    const avgGrade = gradedGrades.length ? gradedGrades.reduce((a: number, b: number) => a + b, 0) / gradedGrades.length : 0;

    setOverallStats({
      totalAssignments: assignmentList.length,
      submitted,
      graded,
      avgGrade: Math.round(avgGrade * 10) / 10,
    });

    // Per-course grades
    const courseGradeMap: Record<string, { grades: number[]; total: number; submitted: number }> = {};
    assignmentList.forEach((a: any) => {
      if (!courseGradeMap[a.course_id]) courseGradeMap[a.course_id] = { grades: [], total: 0, submitted: 0 };
      courseGradeMap[a.course_id].total++;
      const sub = submissionMap.get(a.id);
      if (sub) {
        courseGradeMap[a.course_id].submitted++;
        if ((sub as any).grade !== null) courseGradeMap[a.course_id].grades.push(Number((sub as any).grade));
      }
    });

    setCourseGrades(
      Object.entries(courseGradeMap).map(([courseId, data]) => ({
        name: courseMap[courseId] || "Course",
        average: data.grades.length ? Math.round((data.grades.reduce((a, b) => a + b, 0) / data.grades.length) * 10) / 10 : 0,
        completion: data.total ? Math.round((data.submitted / data.total) * 100) : 0,
      }))
    );

    // Submission status pie
    setSubmissionStats([
      { name: "Submitted & Graded", value: graded },
      { name: "Submitted (Pending)", value: submitted - graded },
      { name: "Not Submitted", value: assignmentList.length - submitted },
    ]);

    // Grade trend over time
    const sortedGraded = submissionList
      .filter((s: any) => s.grade !== null && s.graded_at)
      .sort((a: any, b: any) => new Date(a.graded_at).getTime() - new Date(b.graded_at).getTime());

    setGradeTrend(
      sortedGraded.map((s: any, i: number) => ({
        date: format(parseISO(s.graded_at), "MMM d"),
        grade: Number(s.grade),
        running_avg: Math.round(
          (sortedGraded.slice(0, i + 1).reduce((acc: number, x: any) => acc + Number(x.grade), 0) / (i + 1)) * 10
        ) / 10,
      }))
    );

    setLoading(false);
  };

  const fetchTeacherAnalytics = async () => {
    setLoading(true);

    const { data: courses } = await supabase
      .from("courses")
      .select("id, title")
      .eq("teacher_id", user!.id);

    if (!courses?.length) { setLoading(false); return; }

    const courseIds = courses.map((c: any) => c.id);
    const courseMap: Record<string, string> = {};
    courses.forEach((c: any) => { courseMap[c.id] = c.title; });

    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id")
      .in("course_id", courseIds);

    const { data: assignments } = await supabase
      .from("assignments")
      .select("id, title, course_id, points")
      .in("course_id", courseIds);

    const assignmentIds = (assignments || []).map((a: any) => a.id);

    const { data: submissions } = assignmentIds.length
      ? await supabase.from("assignment_submissions").select("id, assignment_id, grade, graded_at").in("assignment_id", assignmentIds)
      : { data: [] };

    const totalStudents = enrollments?.length || 0;
    const totalAssignments = assignments?.length || 0;
    const totalSubmissions = submissions?.length || 0;
    const gradedSubmissions = (submissions || []).filter((s: any) => s.grade !== null);
    const avgGrade = gradedSubmissions.length
      ? gradedSubmissions.reduce((a: number, s: any) => a + Number(s.grade), 0) / gradedSubmissions.length
      : 0;

    setOverallStats({
      totalAssignments,
      submitted: totalSubmissions,
      graded: gradedSubmissions.length,
      avgGrade: Math.round(avgGrade * 10) / 10,
    });

    // Per-course stats
    const courseStatsMap: Record<string, { students: number; submissions: number; grades: number[] }> = {};
    courseIds.forEach((id) => { courseStatsMap[id] = { students: 0, submissions: 0, grades: [] }; });
    (enrollments || []).forEach((e: any) => { if (courseStatsMap[e.course_id]) courseStatsMap[e.course_id].students++; });

    const assignmentCourseMap: Record<string, string> = {};
    (assignments || []).forEach((a: any) => { assignmentCourseMap[a.id] = a.course_id; });
    (submissions || []).forEach((s: any) => {
      const cId = assignmentCourseMap[s.assignment_id];
      if (cId && courseStatsMap[cId]) {
        courseStatsMap[cId].submissions++;
        if (s.grade !== null) courseStatsMap[cId].grades.push(Number(s.grade));
      }
    });

    setCourseGrades(
      Object.entries(courseStatsMap).map(([courseId, data]) => ({
        name: courseMap[courseId] || "Course",
        average: data.grades.length ? Math.round((data.grades.reduce((a, b) => a + b, 0) / data.grades.length) * 10) / 10 : 0,
        students: data.students,
        submissions: data.submissions,
      }))
    );

    // Submission pie
    const expectedSubmissions = totalStudents * totalAssignments;
    setSubmissionStats([
      { name: "Graded", value: gradedSubmissions.length },
      { name: "Pending Grade", value: totalSubmissions - gradedSubmissions.length },
      { name: "Missing", value: Math.max(0, expectedSubmissions - totalSubmissions) },
    ]);

    setLoading(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground">
          {role === "student" ? "Track your academic performance" : "Monitor class performance"}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2"><BookOpen className="h-4 w-4 text-primary" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overallStats.totalAssignments}</p>
                <p className="text-xs text-muted-foreground">Total Assignments</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[hsl(var(--success))]/10 p-2"><CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overallStats.submitted}</p>
                <p className="text-xs text-muted-foreground">{role === "student" ? "Submitted" : "Total Submissions"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2"><Target className="h-4 w-4 text-accent" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overallStats.graded}</p>
                <p className="text-xs text-muted-foreground">Graded</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-[hsl(var(--warning))]/10 p-2"><Award className="h-4 w-4 text-[hsl(var(--warning))]" /></div>
              <div>
                <p className="text-2xl font-bold text-foreground">{overallStats.avgGrade}%</p>
                <p className="text-xs text-muted-foreground">Avg Grade</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              {role === "student" ? "Grade by Course" : "Class Average by Course"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courseGrades.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={courseGrades}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Bar dataKey="average" name="Average %" radius={[4, 4, 0, 0]}>
                    {courseGrades.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Submission breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
              Submission Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {submissionStats.every((s) => s.value === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={submissionStats.filter((s) => s.value > 0)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {submissionStats.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Grade trend (students only) */}
        {role === "student" && gradeTrend.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-accent" />
                Grade Trend Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={gradeTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                  <Line type="monotone" dataKey="grade" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 4 }} name="Grade" />
                  <Line type="monotone" dataKey="running_avg" stroke={CHART_COLORS[2]} strokeWidth={2} strokeDasharray="5 5" dot={false} name="Running Avg" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Completion rate per course (students) */}
        {role === "student" && courseGrades.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Completion Rate by Course
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {courseGrades.map((cg, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-sm font-medium w-32 truncate">{cg.name}</span>
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${cg.completion}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                      />
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{cg.completion}%</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
