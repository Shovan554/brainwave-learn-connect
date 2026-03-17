import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, FileText, ChevronLeft, ChevronRight, ArrowLeft,
  CheckCircle, Clock, User, Download, Eye,
} from "lucide-react";

type FilterType = "all" | "graded" | "ungraded";

export default function GradeAssignment() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterType>("all");

  // Grade form
  const [grade, setGrade] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!assignmentId || !courseId || !user) return;
    loadData();
  }, [assignmentId, courseId, user]);

  const loadData = async () => {
    setLoading(true);
    const [assignRes, subsRes] = await Promise.all([
      supabase.from("assignments").select("*").eq("id", assignmentId!).single(),
      supabase.from("assignment_submissions").select("*").eq("assignment_id", assignmentId!),
    ]);

    if (assignRes.data) setAssignment(assignRes.data);

    if (subsRes.data && subsRes.data.length > 0) {
      const studentIds = [...new Set(subsRes.data.map((s: any) => s.student_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, major, avatar_url")
        .in("user_id", studentIds);

      const profileMap: Record<string, any> = {};
      if (profiles) for (const p of profiles) profileMap[p.user_id] = p;

      const enriched = subsRes.data.map((s: any) => ({
        ...s,
        profile: profileMap[s.student_id] || null,
      }));
      setSubmissions(enriched);
    }
    setLoading(false);
  };

  const filteredSubmissions = submissions.filter((s) => {
    if (filter === "graded") return s.graded_at !== null;
    if (filter === "ungraded") return s.graded_at === null;
    return true;
  });

  const currentSub = filteredSubmissions[currentIndex];

  // Sync form when current submission changes
  useEffect(() => {
    if (currentSub) {
      setGrade(currentSub.grade?.toString() || "");
      setFeedback(currentSub.feedback || "");
    }
  }, [currentIndex, filteredSubmissions.length, currentSub?.id]);

  const submitGrade = async () => {
    if (!currentSub || !grade) return;
    setSaving(true);
    const { error } = await supabase.from("assignment_submissions").update({
      grade: +grade,
      feedback: feedback.trim() || null,
      graded_at: new Date().toISOString(),
    }).eq("id", currentSub.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Grade saved!" });
      // Update local state
      setSubmissions(prev => prev.map(s =>
        s.id === currentSub.id ? { ...s, grade: +grade, feedback: feedback.trim(), graded_at: new Date().toISOString() } : s
      ));
    }
    setSaving(false);
  };

  const goNext = () => {
    if (currentIndex < filteredSubmissions.length - 1) setCurrentIndex(currentIndex + 1);
  };

  const goPrev = () => {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  };

  const gradedCount = submissions.filter(s => s.graded_at).length;
  const ungradedCount = submissions.filter(s => !s.graded_at).length;

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!assignment) {
    return <DashboardLayout><p>Assignment not found.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="mb-6">
        <Button variant="ghost" size="sm" className="mb-3 gap-1" onClick={() => navigate(`/teacher/courses/${courseId}?tab=assignments`)}>
          <ArrowLeft className="h-4 w-4" /> Back to Assignments
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{assignment.title}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : "No due date"} · {assignment.points} pts · {assignment.weight}%
            </p>
            {assignment.description && <p className="text-sm text-muted-foreground mt-2">{assignment.description}</p>}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> {gradedCount} graded</Badge>
            <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> {ungradedCount} ungraded</Badge>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-4 flex items-center gap-2">
        {(["all", "ungraded", "graded"] as FilterType[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => { setFilter(f); setCurrentIndex(0); }}
            className="capitalize"
          >
            {f} ({f === "all" ? submissions.length : f === "graded" ? gradedCount : ungradedCount})
          </Button>
        ))}
      </div>

      {filteredSubmissions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-center">
            <CheckCircle className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <p className="text-base font-semibold">
              {filter === "ungraded" ? "All graded! 🎉" : filter === "graded" ? "No graded submissions yet" : "No submissions yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Student Submission Panel */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                      {currentSub?.profile?.name?.charAt(0)?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-base">{currentSub?.profile?.name || "Student"}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {currentSub?.profile?.major && `${currentSub.profile.major} · `}
                      Submitted {new Date(currentSub?.submitted_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {currentSub?.graded_at && (
                  <Badge variant="default" className="gap-1 text-xs">
                    <CheckCircle className="h-3 w-3" /> {currentSub.grade}/{assignment.points}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Text content */}
              {currentSub?.text_content && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Response</p>
                  <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                    {currentSub.text_content}
                  </div>
                </div>
              )}

              {/* File attachment - inline preview */}
              {currentSub?.file_url && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Attached File</p>
                    <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-xs">
                      <a href={currentSub.file_url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3" /> Download</a>
                    </Button>
                  </div>
                  {currentSub.file_name && /\.pdf$/i.test(currentSub.file_name) ? (
                    <iframe
                      src={`https://docs.google.com/gview?url=${encodeURIComponent(currentSub.file_url)}&embedded=true`}
                      className="w-full rounded-lg border bg-muted/30"
                      style={{ height: "400px" }}
                      title="PDF Preview"
                    />
                  ) : currentSub.file_name && /\.(png|jpg|jpeg|gif|webp)$/i.test(currentSub.file_name) ? (
                    <img
                      src={currentSub.file_url}
                      alt={currentSub.file_name}
                      className="w-full max-h-[400px] object-contain rounded-lg border bg-muted/30"
                    />
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{currentSub.file_name || "File"}</span>
                    </div>
                  )}
                </div>
              )}

              {!currentSub?.text_content && !currentSub?.file_url && (
                <p className="text-sm text-muted-foreground italic">No content submitted</p>
              )}

              {/* Navigation */}
              <div className="flex items-center justify-between border-t pt-4">
                <Button variant="outline" size="sm" onClick={goPrev} disabled={currentIndex === 0} className="gap-1">
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentIndex + 1} of {filteredSubmissions.length}
                </span>
                <Button variant="outline" size="sm" onClick={goNext} disabled={currentIndex >= filteredSubmissions.length - 1} className="gap-1">
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Grading Panel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Grade Submission</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Score (out of {assignment.points})</label>
                <Input
                  type="number"
                  placeholder={`0 - ${assignment.points}`}
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  min={0}
                  max={assignment.points}
                  className="text-lg font-semibold"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Feedback</label>
                <Textarea
                  placeholder="Write feedback for the student..."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={5}
                />
              </div>
              <Button
                onClick={submitGrade}
                disabled={saving || !grade}
                className="w-full gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                {currentSub?.graded_at ? "Update Grade" : "Submit Grade"}
              </Button>

              {currentSub?.graded_at && (
                <p className="text-xs text-muted-foreground text-center">
                  Last graded: {new Date(currentSub.graded_at).toLocaleString()}
                </p>
              )}

              {/* Quick nav: grade & next */}
              {currentIndex < filteredSubmissions.length - 1 && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={async () => {
                    if (grade) await submitGrade();
                    goNext();
                  }}
                  disabled={saving}
                >
                  {currentSub?.graded_at || grade ? "Save & Next" : "Skip to Next"} <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardLayout>
  );
}
