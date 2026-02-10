import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Users, AlertTriangle, PlusCircle, ArrowRight } from "lucide-react";

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [stats, setStats] = useState({ courses: 0, students: 0, reports: 0 });

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
