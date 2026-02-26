import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AICopilot } from "@/components/AICopilot";
import {
  Loader2, Upload, Plus, FileText, Link as LinkIcon, Trash2, Copy,
  Users, AlertTriangle, Brain, ExternalLink, ChevronDown, ChevronUp, FolderPlus, Folder,
} from "lucide-react";

export default function CourseDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Syllabus
  const [syllabusFiles, setSyllabusFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);

  // Weekly content
  const [weeks, setWeeks] = useState<any[]>([]);
  const [weekFolders, setWeekFolders] = useState<Record<string, any[]>>({});
  const [folderAssets, setFolderAssets] = useState<Record<string, any[]>>({});
  const [weekAssets, setWeekAssets] = useState<Record<string, any[]>>({});
  const [newWeek, setNewWeek] = useState({ week_number: 1, title: "", description: "" });
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newAssetLink, setNewAssetLink] = useState("");
  const [newAssetName, setNewAssetName] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState(false);

  // Assignments
  const [assignments, setAssignments] = useState<any[]>([]);
  const [newAssignment, setNewAssignment] = useState({
    title: "", description: "", due_date: "", points: 0, weight: 0, estimated_time_minutes: 30,
  });
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Record<string, any[]>>({});

  // Students
  const [students, setStudents] = useState<any[]>([]);

  // Reports
  const [reports, setReports] = useState<any[]>([]);

  useEffect(() => {
    if (!id || !user) return;
    loadCourse();
  }, [id, user]);

  const loadCourse = async () => {
    setLoading(true);
    const [courseRes, filesRes, weeksRes, assignRes, enrollRes, reportsRes] = await Promise.all([
      supabase.from("courses").select("*").eq("id", id!).single(),
      supabase.from("course_files").select("*").eq("course_id", id!).order("created_at"),
      supabase.from("weekly_content").select("*").eq("course_id", id!).order("week_number"),
      supabase.from("assignments").select("*").eq("course_id", id!).order("due_date"),
      supabase.from("enrollments").select("student_id, enrolled_at").eq("course_id", id!),
      supabase.from("content_reports").select("*").eq("course_id", id!).order("created_at", { ascending: false }),
    ]);
    if (courseRes.data) setCourse(courseRes.data);
    if (filesRes.data) setSyllabusFiles(filesRes.data);
    if (weeksRes.data) {
      setWeeks(weeksRes.data);
      const weekIds = weeksRes.data.map((w: any) => w.id);
      if (weekIds.length > 0) {
        // Load folders for all weeks
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

          // Load assets for all folders
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
        // Load loose assets (no folder)
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
      const assignIds = assignRes.data.map((a: any) => a.id);
      if (assignIds.length > 0) {
        const { data: subs } = await supabase
          .from("assignment_submissions")
          .select("*")
          .in("assignment_id", assignIds);
        if (subs && subs.length > 0) {
          // Fetch profiles for submission students
          const subStudentIds = [...new Set(subs.map((s: any) => s.student_id))];
          const { data: subProfiles } = await supabase
            .from("profiles")
            .select("user_id, name, major")
            .in("user_id", subStudentIds);
          const profileMap: Record<string, any> = {};
          if (subProfiles) {
            for (const p of subProfiles) profileMap[p.user_id] = p;
          }
          const grouped: Record<string, any[]> = {};
          for (const s of subs) {
            const enriched = { ...s, profiles: profileMap[s.student_id] || null };
            if (!grouped[s.assignment_id]) grouped[s.assignment_id] = [];
            grouped[s.assignment_id].push(enriched);
          }
          setSubmissions(grouped);
        }
      }
    }
    // Fetch enrolled students with their profiles separately
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
    if (reportsRes.data) setReports(reportsRes.data);
    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    const filePath = `${user.id}/${id}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("course-files").upload(filePath, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(filePath);
    await supabase.from("course_files").insert({
      course_id: id!, uploaded_by: user.id, file_url: urlData.publicUrl, file_name: file.name, file_type: "syllabus",
    });
    setUploading(false);
    loadCourse();
    toast({ title: "File uploaded" });
  };

  const addWeek = async () => {
    if (!id) return;
    const { error } = await supabase.from("weekly_content").insert({ course_id: id, ...newWeek });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewWeek({ week_number: (newWeek.week_number || 1) + 1, title: "", description: "" });
    loadCourse();
  };

  const toggleWeekPublish = async (weekId: string, current: boolean) => {
    await supabase.from("weekly_content").update({ is_published: !current }).eq("id", weekId);
    loadCourse();
  };

  const addFolder = async (weekId: string) => {
    if (!newFolderName.trim()) return;
    const existing = weekFolders[weekId] || [];
    await supabase.from("weekly_content_folders").insert({
      weekly_content_id: weekId,
      name: newFolderName.trim(),
      sort_order: existing.length,
    });
    setNewFolderName("");
    loadCourse();
  };

  const deleteFolder = async (folderId: string) => {
    await supabase.from("weekly_content_folders").delete().eq("id", folderId);
    loadCourse();
  };

  const addAssetLink = async (folderId: string, weekId: string) => {
    if (!newAssetLink.trim()) return;
    await supabase.from("weekly_content_assets").insert({
      weekly_content_id: weekId,
      folder_id: folderId,
      link_url: newAssetLink.trim(),
      file_name: newAssetName.trim() || newAssetLink.trim(),
    });
    setNewAssetLink("");
    setNewAssetName("");
    loadCourse();
  };

  const handleAssetUpload = async (folderId: string, weekId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingAsset(true);
    const filePath = `${user.id}/${id}/weeks/${weekId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from("course-files").upload(filePath, file);
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setUploadingAsset(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(filePath);
    await supabase.from("weekly_content_assets").insert({
      weekly_content_id: weekId,
      folder_id: folderId,
      file_url: urlData.publicUrl,
      file_name: file.name,
    });
    setUploadingAsset(false);
    loadCourse();
  };

  const deleteAsset = async (assetId: string) => {
    await supabase.from("weekly_content_assets").delete().eq("id", assetId);
    loadCourse();
  };

  const addAssignment = async () => {
    if (!id) return;
    const { error } = await supabase.from("assignments").insert({
      course_id: id, ...newAssignment, due_date: newAssignment.due_date || null,
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewAssignment({ title: "", description: "", due_date: "", points: 0, weight: 0, estimated_time_minutes: 30 });
    loadCourse();
  };

  const toggleAssignmentPublish = async (aId: string, current: boolean) => {
    await supabase.from("assignments").update({ is_published: !current }).eq("id", aId);
    loadCourse();
  };

  const gradeSubmission = async (subId: string, grade: number, feedback: string) => {
    await supabase.from("assignment_submissions").update({ grade, feedback, graded_at: new Date().toISOString() }).eq("id", subId);
    loadCourse();
    toast({ title: "Graded!" });
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(course?.invite_code || "");
    toast({ title: "Copied!", description: "Invite code copied to clipboard" });
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }
  if (!course) {
    return <DashboardLayout><p>Course not found.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{course.title}</h1>
          <p className="text-muted-foreground">{course.term}</p>
        </div>
        <Button variant="outline" size="sm" onClick={copyInviteCode}>
          <Copy className="mr-2 h-3 w-3" />
          {course.invite_code}
        </Button>
      </div>

      <Tabs defaultValue="syllabus">
        <TabsList className="mb-6 flex-wrap">
          <TabsTrigger value="syllabus">Syllabus</TabsTrigger>
          <TabsTrigger value="weekly">Weekly Content</TabsTrigger>
          <TabsTrigger value="assignments">Assignments</TabsTrigger>
          <TabsTrigger value="students">Students ({students.length})</TabsTrigger>
          <TabsTrigger value="ai">AI Tools</TabsTrigger>
          <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
        </TabsList>

        {/* Syllabus Tab */}
        <TabsContent value="syllabus">
          <Card>
            <CardHeader><CardTitle className="text-base">Syllabus Files</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="syllabus-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-muted">
                  <Upload className="h-4 w-4" />
                  {uploading ? "Uploading..." : "Upload PDF/DOC"}
                </Label>
                <input id="syllabus-upload" type="file" accept=".pdf,.doc,.docx,.pptx,.ppt" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </div>
              {syllabusFiles.map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <a href={f.file_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-primary hover:underline">{f.file_name}</a>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Weekly Content Tab */}
        <TabsContent value="weekly">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Add Week</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-3">
                  <Input type="number" placeholder="Week #" value={newWeek.week_number} onChange={(e) => setNewWeek({ ...newWeek, week_number: +e.target.value })} />
                  <Input placeholder="Title" className="col-span-3" value={newWeek.title} onChange={(e) => setNewWeek({ ...newWeek, title: e.target.value })} />
                </div>
                <Textarea placeholder="Description" value={newWeek.description} onChange={(e) => setNewWeek({ ...newWeek, description: e.target.value })} rows={2} />
                <Button size="sm" onClick={addWeek} disabled={!newWeek.title}><Plus className="mr-2 h-3 w-3" /> Add Week</Button>
              </CardContent>
            </Card>

            {weeks.map((w) => (
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
                    <div className="flex items-center gap-3">
                      <Badge variant={w.is_published ? "default" : "secondary"}>
                        {w.is_published ? "Published" : "Draft"}
                      </Badge>
                      <Switch checked={w.is_published} onCheckedChange={() => toggleWeekPublish(w.id, w.is_published)} />
                    </div>
                  </div>

                  {expandedWeek === w.id && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      {/* Folders */}
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Folders</p>
                      {(weekFolders[w.id] || []).map((folder) => (
                        <div key={folder.id} className="rounded-lg border">
                          <div className="flex items-center justify-between p-3">
                            <button className="flex items-center gap-2 text-left" onClick={() => setExpandedFolder(expandedFolder === folder.id ? null : folder.id)}>
                              {expandedFolder === folder.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              <Folder className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium">{folder.name}</span>
                              <Badge variant="outline" className="text-xs">{(folderAssets[folder.id] || []).length}</Badge>
                            </button>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteFolder(folder.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>

                          {expandedFolder === folder.id && (
                            <div className="space-y-2 border-t px-3 pb-3 pt-2">
                              {(folderAssets[folder.id] || []).map((asset) => (
                                <div key={asset.id} className="flex items-center justify-between rounded-lg bg-muted/50 p-2">
                                  <div className="flex items-center gap-2">
                                    {asset.file_url ? <FileText className="h-3 w-3 text-muted-foreground" /> : <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                                    <a href={asset.file_url || asset.link_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                                      {asset.file_name || asset.link_url}
                                    </a>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteAsset(asset.id)}>
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              ))}

                              <div className="flex gap-2">
                                <Input placeholder="Link name" value={newAssetName} onChange={(e) => setNewAssetName(e.target.value)} className="flex-1" />
                                <Input placeholder="https://..." value={newAssetLink} onChange={(e) => setNewAssetLink(e.target.value)} className="flex-1" />
                                <Button size="sm" variant="outline" onClick={() => addAssetLink(folder.id, w.id)} disabled={!newAssetLink.trim()}>
                                  <LinkIcon className="mr-1 h-3 w-3" /> Add
                                </Button>
                              </div>
                              <div>
                                <Label htmlFor={`folder-upload-${folder.id}`} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted">
                                  <Upload className="h-3 w-3" /> {uploadingAsset ? "Uploading..." : "Upload File"}
                                </Label>
                                <input id={`folder-upload-${folder.id}`} type="file" className="hidden" onChange={(e) => handleAssetUpload(folder.id, w.id, e)} disabled={uploadingAsset} />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Add folder */}
                      <div className="flex gap-2">
                        <Input placeholder="New folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} className="flex-1" />
                        <Button size="sm" variant="outline" onClick={() => addFolder(w.id)} disabled={!newFolderName.trim()}>
                          <FolderPlus className="mr-1 h-3 w-3" /> Add Folder
                        </Button>
                      </div>

                      {/* Loose materials (no folder) */}
                      {(weekAssets[w.id] || []).length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Ungrouped Materials</p>
                          {(weekAssets[w.id] || []).map((asset) => (
                            <div key={asset.id} className="flex items-center justify-between rounded-lg border p-2">
                              <div className="flex items-center gap-2">
                                {asset.file_url ? <FileText className="h-3 w-3 text-muted-foreground" /> : <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                                <a href={asset.file_url || asset.link_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                                  {asset.file_name || asset.link_url}
                                </a>
                              </div>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteAsset(asset.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Assignments Tab */}
        <TabsContent value="assignments">
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Create Assignment</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Title" value={newAssignment.title} onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })} />
                <Textarea placeholder="Description" value={newAssignment.description} onChange={(e) => setNewAssignment({ ...newAssignment, description: e.target.value })} rows={2} />
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1"><Label className="text-xs">Due Date</Label><Input type="datetime-local" value={newAssignment.due_date} onChange={(e) => setNewAssignment({ ...newAssignment, due_date: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Points</Label><Input type="number" value={newAssignment.points} onChange={(e) => setNewAssignment({ ...newAssignment, points: +e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Weight %</Label><Input type="number" value={newAssignment.weight} onChange={(e) => setNewAssignment({ ...newAssignment, weight: +e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Est. Minutes</Label><Input type="number" value={newAssignment.estimated_time_minutes} onChange={(e) => setNewAssignment({ ...newAssignment, estimated_time_minutes: +e.target.value })} /></div>
                </div>
                <Button size="sm" onClick={addAssignment} disabled={!newAssignment.title}><Plus className="mr-2 h-3 w-3" /> Create Assignment</Button>
              </CardContent>
            </Card>

            {assignments.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <button className="flex items-center gap-2 text-left" onClick={() => setExpandedAssignment(expandedAssignment === a.id ? null : a.id)}>
                      {expandedAssignment === a.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <div>
                        <p className="font-medium">{a.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {a.due_date ? new Date(a.due_date).toLocaleDateString() : "No due date"} · {a.points} pts · {a.weight}% · ~{a.estimated_time_minutes}min
                        </p>
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{(submissions[a.id] || []).length} submissions</Badge>
                      <Badge variant={a.is_published ? "default" : "secondary"}>{a.is_published ? "Published" : "Draft"}</Badge>
                      <Switch checked={a.is_published} onCheckedChange={() => toggleAssignmentPublish(a.id, a.is_published)} />
                    </div>
                  </div>

                  {expandedAssignment === a.id && (
                    <div className="mt-4 space-y-3 border-t pt-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Submissions</p>
                      {(submissions[a.id] || []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No submissions yet</p>
                      ) : (
                        (submissions[a.id] || []).map((sub) => (
                          <SubmissionGrader key={sub.id} submission={sub} onGrade={gradeSubmission} />
                        ))
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Students Tab */}
        <TabsContent value="students">
          <Card>
            <CardContent className="p-4">
              {students.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No students enrolled yet. Share the invite code: <strong>{course.invite_code}</strong></p>
                </div>
              ) : (
                <div className="space-y-2">
                  {students.map((s: any) => (
                    <div key={s.student_id} className="flex items-center gap-3 rounded-lg border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {(s.profiles?.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{s.profiles?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{s.profiles?.major || "No major"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai">
          <AICopilot courseId={id!} mode="teacher" />
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports">
          <Card>
            <CardContent className="p-4">
              {reports.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <AlertTriangle className="mb-3 h-10 w-10 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No reports submitted</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs">{r.reason}</Badge>
                        <span className="text-xs text-muted-foreground">{r.target_type}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </DashboardLayout>
  );
}

// Inline grader component
function SubmissionGrader({ submission, onGrade }: { submission: any; onGrade: (id: string, grade: number, feedback: string) => void }) {
  const [grade, setGrade] = useState(submission.grade?.toString() || "");
  const [feedback, setFeedback] = useState(submission.feedback || "");

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">{(submission.profiles as any)?.name || "Student"}</p>
          <p className="text-xs text-muted-foreground">Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
        </div>
        {submission.graded_at && <Badge variant="default" className="text-xs">Graded: {submission.grade}</Badge>}
      </div>
      {submission.text_content && <p className="text-sm bg-muted rounded p-2">{submission.text_content}</p>}
      {submission.file_url && (
        <a href={submission.file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <FileText className="h-3 w-3" /> {submission.file_name || "Download"}
        </a>
      )}
      <div className="flex gap-2">
        <Input placeholder="Grade" type="number" value={grade} onChange={(e) => setGrade(e.target.value)} className="w-24" />
        <Input placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} className="flex-1" />
        <Button size="sm" onClick={() => onGrade(submission.id, +grade, feedback)} disabled={!grade}>Grade</Button>
      </div>
    </div>
  );
}
