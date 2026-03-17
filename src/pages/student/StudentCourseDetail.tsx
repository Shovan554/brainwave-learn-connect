import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { AICopilot } from "@/components/AICopilot";
import {
  Loader2, FileText, Calendar, Clock, Users, Flag,
  ExternalLink, Upload, ChevronDown, ChevronUp, CheckCircle, Brain, Folder, Download, Eye,
} from "lucide-react";
import { AssetSummaryDialog } from "@/components/AssetSummaryDialog";

export default function StudentCourseDetail() {
  const [searchParams] = useSearchParams();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [syllabusFiles, setSyllabusFiles] = useState<any[]>([]);
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekFolders, setWeekFolders] = useState<Record<string, any[]>>({});
  const [folderAssets, setFolderAssets] = useState<Record<string, any[]>>({});
  const [weekAssets, setWeekAssets] = useState<Record<string, any[]>>({});
  const [assignments, setAssignments] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [mySubmissions, setMySubmissions] = useState<Record<string, any>>({});
  const [assignmentAssets, setAssignmentAssets] = useState<Record<string, any[]>>({});
  const [reportTarget, setReportTarget] = useState<{ type: string; id: string } | null>(null);
  const [reportReason, setReportReason] = useState("");
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);

  // Submission form
  const [submissionText, setSubmissionText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    loadData();
  }, [id, user]);

  const loadData = async () => {
    setLoading(true);
    const [courseRes, filesRes, weeksRes, assignRes, enrollRes] = await Promise.all([
      supabase.from("courses").select("*").eq("id", id!).single(),
      supabase.from("course_files").select("*").eq("course_id", id!),
      supabase.from("weekly_content").select("*").eq("course_id", id!).eq("is_published", true).order("week_number"),
      supabase.from("assignments").select("*").eq("course_id", id!).eq("is_published", true).order("due_date"),
      supabase.from("enrollments").select("student_id").eq("course_id", id!),
    ]);
    if (courseRes.data) setCourse(courseRes.data);
    if (filesRes.data) setSyllabusFiles(filesRes.data);
    if (weeksRes.data) {
      setWeeks(weeksRes.data);
      const weekIds = weeksRes.data.map((w: any) => w.id);
      if (weekIds.length > 0) {
        // Load folders
        const { data: folders } = await supabase
          .from("weekly_content_folders")
          .select("*")
          .in("weekly_content_id", weekIds)
          .order("sort_order");
        if (folders) {
          const groupedFolders: Record<string, any[]> = {};
          for (const f of folders) {
            if (!groupedFolders[f.weekly_content_id]) groupedFolders[f.weekly_content_id] = [];
            groupedFolders[f.weekly_content_id].push(f);
          }
          setWeekFolders(groupedFolders);

          const folderIds = folders.map((f: any) => f.id);
          if (folderIds.length > 0) {
            const { data: fAssets } = await supabase
              .from("weekly_content_assets")
              .select("*")
              .in("folder_id", folderIds);
            if (fAssets) {
              const groupedAssets: Record<string, any[]> = {};
              for (const a of fAssets) {
                if (!groupedAssets[a.folder_id]) groupedAssets[a.folder_id] = [];
                groupedAssets[a.folder_id].push(a);
              }
              setFolderAssets(groupedAssets);
            }
          }
        }
        // Loose assets
        const { data: assets } = await supabase
          .from("weekly_content_assets")
          .select("*")
          .in("weekly_content_id", weekIds)
          .is("folder_id", null);
        if (assets) {
          const grouped: Record<string, any[]> = {};
          for (const a of assets) {
            if (!grouped[a.weekly_content_id]) grouped[a.weekly_content_id] = [];
            grouped[a.weekly_content_id].push(a);
          }
          setWeekAssets(grouped);
        }
      }
    }
    if (assignRes.data) {
      setAssignments(assignRes.data);
      // Load assignment assets
      const assignIds = assignRes.data.map((a: any) => a.id);
      if (assignIds.length > 0) {
        const { data: aAssets } = await supabase
          .from("assignment_assets")
          .select("*")
          .in("assignment_id", assignIds);
        if (aAssets) {
          const groupedAssets: Record<string, any[]> = {};
          for (const a of aAssets) {
            if (!groupedAssets[a.assignment_id]) groupedAssets[a.assignment_id] = [];
            groupedAssets[a.assignment_id].push(a);
          }
          setAssignmentAssets(groupedAssets);
        }
      }
      if (user) {
        const { data: subs } = await supabase
          .from("assignment_submissions")
          .select("*")
          .eq("student_id", user.id);
        if (subs) {
          const map: Record<string, any> = {};
          for (const s of subs) map[s.assignment_id] = s;
          setMySubmissions(map);
        }
      }
    }
    // Fetch enrolled students with profiles separately
    if (enrollRes.data && enrollRes.data.length > 0) {
      const studentIds = enrollRes.data.map((e: any) => e.student_id);
      const { data: enrollProfiles } = await supabase
        .from("profiles")
        .select("user_id, name, major")
        .in("user_id", studentIds);
      const profileMap: Record<string, any> = {};
      if (enrollProfiles) {
        for (const p of enrollProfiles) profileMap[p.user_id] = p;
      }
      const enriched = enrollRes.data.map((e: any) => ({
        ...e,
        profiles: profileMap[e.student_id] || null,
      }));
      setStudents(enriched);
    } else {
      setStudents([]);
    }
    setLoading(false);
  };

  const submitAssignment = async (assignmentId: string) => {
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("assignment_submissions").insert({
      assignment_id: assignmentId,
      student_id: user.id,
      text_content: submissionText.trim(),
    });
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Already submitted" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!" });
      setSubmissionText("");
      setExpandedAssignment(null);
      loadData();
    }
    setSubmitting(false);
  };

  const handleSubmissionFileUpload = async (assignmentId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setSubmitting(true);
    const filePath = `submissions/${user.id}/${assignmentId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("course-files").upload(filePath, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(filePath);
    const { error } = await supabase.from("assignment_submissions").insert({
      assignment_id: assignmentId,
      student_id: user.id,
      file_url: urlData.publicUrl,
      file_name: file.name,
      text_content: submissionText.trim() || null,
    });
    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Already submitted" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Submitted!" });
      setSubmissionText("");
      setExpandedAssignment(null);
      loadData();
    }
    setSubmitting(false);
  };

  const submitReport = async () => {
    if (!reportTarget || !reportReason || !user || !id) return;
    const { error } = await supabase.from("content_reports").insert({
      course_id: id, reporter_id: user.id, target_type: reportTarget.type, target_id: reportTarget.id, reason: reportReason,
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Content</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="ai">AI Copilot</TabsTrigger>
        </TabsList>

        {/* Overview */}
        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base">Syllabus</CardTitle></CardHeader>
            <CardContent>
              {syllabusFiles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No syllabus files uploaded yet</p>
              ) : (
                <div className="space-y-4">
                  {syllabusFiles.map((f) => (
                    <div key={f.id} className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="h-4 w-4 text-primary" /> {f.file_name}
                        </div>
                        <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-xs">
                          <a href={f.file_url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3" /> Download</a>
                        </Button>
                      </div>
                      {f.file_name && /\.pdf$/i.test(f.file_name) && (
                        <iframe
                          src={`https://docs.google.com/gview?url=${encodeURIComponent(f.file_url)}&embedded=true`}
                          className="w-full rounded-lg border bg-muted/30"
                          style={{ height: "calc(100vh - 340px)", minHeight: "400px" }}
                          title={`Preview ${f.file_name}`}
                        />
                      )}
                      {f.file_name && /\.(png|jpg|jpeg|gif|webp)$/i.test(f.file_name) && (
                        <img src={f.file_url} alt={f.file_name} className="w-full max-h-[600px] object-contain rounded-lg border bg-muted/30" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Content */}
        <TabsContent value="weekly">
          <div className="space-y-3">
            {weeks.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No content published yet</CardContent></Card>
            ) : weeks.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button className="flex items-center gap-2 text-left" onClick={() => setExpandedWeek(expandedWeek === w.id ? null : w.id)}>
                      {expandedWeek === w.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <div>
                        <p className="font-medium">Week {w.week_number}: {w.title}</p>
                        <p className="text-sm text-muted-foreground">{w.description}</p>
                      </div>
                    </button>
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
                  </div>

                  {expandedWeek === w.id && (
                    <div className="mt-3 space-y-3 border-t pt-3">
                      {/* Folders */}
                      {(weekFolders[w.id] || []).map((folder) => (
                        <div key={folder.id} className="rounded-lg border">
                          <button className="flex w-full items-center gap-2 p-3 text-left" onClick={() => setExpandedFolder(expandedFolder === folder.id ? null : folder.id)}>
                            {expandedFolder === folder.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <Folder className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">{folder.name}</span>
                          </button>
                          {expandedFolder === folder.id && (
                            <div className="space-y-1 border-t px-3 pb-3 pt-2">
                              {(folderAssets[folder.id] || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No materials yet</p>
                              ) : (folderAssets[folder.id] || []).map((asset) => (
                                <div key={asset.id} className="flex items-center gap-1">
                                  <a href={asset.file_url || asset.link_url} target="_blank" rel="noreferrer"
                                    className="flex flex-1 items-center gap-2 rounded-lg bg-muted/50 p-2 text-sm hover:bg-muted">
                                    {asset.file_url ? <FileText className="h-3 w-3 text-primary" /> : <ExternalLink className="h-3 w-3 text-primary" />}
                                    {asset.file_name || asset.link_url}
                                  </a>
                                  {asset.file_url && asset.file_name && (
                                    <AssetSummaryDialog fileUrl={asset.file_url} fileName={asset.file_name} courseId={id} courseTitle={course?.title} />
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Loose materials */}
                      {(weekAssets[w.id] || []).length > 0 && (
                        <div className="space-y-1">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Other Materials</p>
                          {(weekAssets[w.id] || []).map((asset) => (
                            <div key={asset.id} className="flex items-center gap-1">
                              <a href={asset.file_url || asset.link_url} target="_blank" rel="noreferrer"
                                className="flex flex-1 items-center gap-2 rounded-lg border p-2 text-sm hover:bg-muted">
                                {asset.file_url ? <FileText className="h-3 w-3 text-primary" /> : <ExternalLink className="h-3 w-3 text-primary" />}
                                {asset.file_name || asset.link_url}
                              </a>
                              {asset.file_url && asset.file_name && (
                                <AssetSummaryDialog fileUrl={asset.file_url} fileName={asset.file_name} courseId={id} courseTitle={course?.title} />
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {(weekFolders[w.id] || []).length === 0 && (weekAssets[w.id] || []).length === 0 && (
                        <p className="text-sm text-muted-foreground">No materials added yet</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Assignments */}
        <TabsContent value="assignments">
          <div className="space-y-3">
            {assignments.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No assignments published yet</CardContent></Card>
            ) : assignments.map((a) => {
              const sub = mySubmissions[a.id];
              return (
                <Card key={a.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/student/courses/${id}/assignments/${a.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">{a.description}</p>
                        <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                          {a.due_date && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(a.due_date).toLocaleDateString()}</span>}
                          <span>{a.points} pts</span>
                          <span>{a.weight}%</span>
                          {a.estimated_time_minutes > 0 && <span className="flex items-center gap-1"><Clock className="h-3 w-3" />~{a.estimated_time_minutes}min</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {sub ? (
                          <Badge variant="default" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            {sub.graded_at ? `${sub.grade} pts` : "Submitted"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not submitted</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* AI Copilot */}
        <TabsContent value="ai">
          <AICopilot courseId={id!} mode="student" />
        </TabsContent>

      </Tabs>
    </DashboardLayout>
  );
}
