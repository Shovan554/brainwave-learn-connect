import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FileText, Calendar, Clock, Film, Users, Flag } from "lucide-react";

export default function StudentCourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syllabusFiles, setSyllabusFiles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [reportTarget, setReportTarget] = useState<{ type: string; id: string } | null>(null);
  const [reportReason, setReportReason] = useState("");

  useEffect(() => {
    if (!id) return;
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, filesRes, weeksRes, assignRes, enrollRes] = await Promise.all([
      supabase.from("courses").select("*").eq("id", id!).single(),
      supabase.from("course_files").select("*").eq("course_id", id!),
      supabase.from("weekly_content").select("*").eq("course_id", id!).eq("is_published", true).order("week_number"),
      supabase.from("assignments").select("*").eq("course_id", id!).eq("is_published", true).order("due_date"),
      supabase.from("enrollments").select("student_id, profiles!inner(name, major, user_id)").eq("course_id", id!),
    ]);
    if (courseRes.data) setCourse(courseRes.data);
    if (filesRes.data) setSyllabusFiles(filesRes.data);
    if (weeksRes.data) setWeeks(weeksRes.data);
    if (assignRes.data) setAssignments(assignRes.data);
    if (enrollRes.data) setStudents(enrollRes.data as any);
    setLoading(false);
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason || !user || !id) return;
    const { error } = await supabase.from("content_reports").insert({
      course_id: id,
      reporter_id: user.id,
      target_type: reportTarget.type,
      target_id: reportTarget.id,
      reason: reportReason,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Report submitted" });
      setReportTarget(null);
      setReportReason("");
    }
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!course) {
    return <DashboardLayout><p>Course not found.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
        <p className="text-muted-foreground">{course.term} {course.description && `— ${course.description}`}</p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Content</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="reels">Reels</TabsTrigger>
          <TabsTrigger value="students">Students</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base">Syllabus</CardTitle></CardHeader>
            <CardContent>
              {syllabusFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No syllabus files uploaded yet</p>
              ) : (
                <div className="space-y-2">
                  {syllabusFiles.map((f) => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border p-3 text-sm hover:bg-muted">
                      <FileText className="h-4 w-4 text-primary" />
                      {f.file_name}
                    </a>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="weekly">
          <div className="space-y-3">
            {weeks.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No content published yet</CardContent></Card>
            ) : weeks.map((w) => (
              <Card key={w.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">Week {w.week_number}: {w.title}</p>
                    <p className="text-sm text-muted-foreground">{w.description}</p>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={() => setReportTarget({ type: "weekly_content", id: w.id })}>
                        <Flag className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Report Content</DialogTitle></DialogHeader>
                      <Select value={reportReason} onValueChange={setReportReason}>
                        <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inappropriate">Inappropriate</SelectItem>
                          <SelectItem value="incorrect">Incorrect</SelectItem>
                          <SelectItem value="offensive">Offensive</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={submitReport} disabled={!reportReason}>Submit Report</Button>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="assignments">
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No assignments published yet</CardContent></Card>
            ) : assignments.map((a) => (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{a.title}</p>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                    <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                      {a.due_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(a.due_date).toLocaleDateString()}</span>}
                      <span>{a.points} pts</span>
                      <span>{a.weight}%</span>
                      {a.estimated_time_minutes > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{a.estimated_time_minutes}min</span>}
                    </div>
                  </div>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={() => setReportTarget({ type: "assignment", id: a.id })}>
                        <Flag className="h-3 w-3" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Report Content</DialogTitle></DialogHeader>
                      <Select value={reportReason} onValueChange={setReportReason}>
                        <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="inappropriate">Inappropriate</SelectItem>
                          <SelectItem value="incorrect">Incorrect</SelectItem>
                          <SelectItem value="offensive">Offensive</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={submitReport} disabled={!reportReason}>Submit Report</Button>
                    </DialogContent>
                  </Dialog>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="reels">
          <Card>
            <CardContent className="flex flex-col items-center py-16 text-center">
              <Film className="mb-4 h-16 w-16 text-muted-foreground/30" />
              <h3 className="mb-2 text-lg font-semibold">Microlearning Reels</h3>
              <p className="text-sm text-muted-foreground">Coming soon — bite-sized video lessons for quick learning</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="students">
          <div className="space-y-2">
            {students.map((s: any) => (
              <Card key={s.student_id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {(s.profiles?.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{s.profiles?.name}</p>
                    <p className="text-xs text-muted-foreground">{s.profiles?.major || "No major"}</p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/students/${s.profiles?.user_id}/profile`}>View Profile</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}
