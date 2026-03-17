import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import {
  Loader2, FileText, Calendar, Clock, ArrowLeft,
  CheckCircle, Upload, Download, ExternalLink, Bot, Send, Sparkles,
} from "lucide-react";

export default function StudentAssignment() {
  const { courseId, assignmentId } = useParams<{ courseId: string; assignmentId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [assignment, setAssignment] = useState<any>(null);
  const [course, setCourse] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [assets, setAssets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submissionText, setSubmissionText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!assignmentId || !courseId || !user) return;
    loadData();
  }, [assignmentId, courseId, user]);

  const loadData = async () => {
    setLoading(true);
    const [assignRes, courseRes, subRes, assetsRes] = await Promise.all([
      supabase.from("assignments").select("*").eq("id", assignmentId!).single(),
      supabase.from("courses").select("title, term").eq("id", courseId!).single(),
      supabase.from("assignment_submissions").select("*").eq("assignment_id", assignmentId!).eq("student_id", user!.id).maybeSingle(),
      supabase.from("assignment_assets").select("*").eq("assignment_id", assignmentId!),
    ]);
    if (assignRes.data) setAssignment(assignRes.data);
    if (courseRes.data) setCourse(courseRes.data);
    if (subRes.data) setSubmission(subRes.data);
    if (assetsRes.data) setAssets(assetsRes.data);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!user || !assignmentId) return;
    setSubmitting(true);

    let fileUrl: string | null = null;
    let fileName: string | null = null;

    if (selectedFile) {
      const filePath = `submissions/${user.id}/${assignmentId}/${Date.now()}_${selectedFile.name}`;
      const { error: uploadError } = await supabase.storage.from("course-files").upload(filePath, selectedFile);
      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        setSubmitting(false);
        return;
      }
      const { data: urlData } = supabase.storage.from("course-files").getPublicUrl(filePath);
      fileUrl = urlData.publicUrl;
      fileName = selectedFile.name;
    }

    const { error } = await supabase.from("assignment_submissions").insert({
      assignment_id: assignmentId,
      student_id: user.id,
      text_content: submissionText.trim() || null,
      file_url: fileUrl,
      file_name: fileName,
    });

    if (error) {
      toast({ title: "Error", description: error.message.includes("duplicate") ? "Already submitted" : error.message, variant: "destructive" });
    } else {
      toast({ title: "Assignment submitted!" });
      setSubmissionText("");
      setSelectedFile(null);
      loadData();
    }
    setSubmitting(false);
  };

  const isPastDue = assignment?.due_date && new Date(assignment.due_date) < new Date();

  // AI Help state
  type AiMsg = { role: "user" | "assistant"; content: string };
  const [aiMessages, setAiMessages] = useState<AiMsg[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const aiScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (aiScrollRef.current) {
      aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
    }
  }, [aiMessages]);

  const buildAssignmentContext = (): string => {
    let ctx = `[Assignment Context]\nTitle: ${assignment?.title}\nDescription: ${assignment?.description || "None"}\nDue: ${assignment?.due_date ? new Date(assignment.due_date).toLocaleString() : "TBD"}\nPoints: ${assignment?.points} | Weight: ${assignment?.weight}%`;
    if (assignment?.estimated_time_minutes) ctx += `\nEstimated time: ~${assignment.estimated_time_minutes} min`;
    if (assets.length) ctx += `\nAttached files: ${assets.map((a: any) => a.file_name || a.link_url).join(", ")}`;
    return ctx;
  };

  const sendAiMessage = async () => {
    if (!aiInput.trim() || aiLoading) return;
    const userMsg: AiMsg = { role: "user", content: aiInput.trim() };
    const allMessages = [...aiMessages, userMsg];
    setAiMessages(allMessages);
    setAiInput("");
    setAiLoading(true);

    // Prepend assignment context to the first user message
    const messagesForApi = allMessages.map((m, i) => {
      if (i === 0 && m.role === "user") {
        return { role: m.role, content: `${buildAssignmentContext()}\n\nStudent question: ${m.content}` };
      }
      return m;
    });

    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: messagesForApi,
          courseId,
          action: "student",
          userToken: token,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        toast({ title: "AI Error", description: errData.error || "Failed to get response", variant: "destructive" });
        setAiLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { setAiLoading(false); return; }
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantSoFar = "";

      const upsertAssistant = (text: string) => {
        assistantSoFar = text;
        setAiMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: text } : m);
          }
          return [...prev, { role: "assistant", content: text }];
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(assistantSoFar + content);
          } catch { /* partial */ }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to reach AI assistant", variant: "destructive" });
    }
    setAiLoading(false);
  };

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
        <Button variant="ghost" size="sm" className="mb-3 gap-1" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{course?.title} · {course?.term}</p>
            <h1 className="text-2xl font-bold tracking-tight">{assignment.title}</h1>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {assignment.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(assignment.due_date).toLocaleDateString()} at {new Date(assignment.due_date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <span>{assignment.points} pts</span>
              <span>{assignment.weight}%</span>
              {assignment.estimated_time_minutes > 0 && (
                <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{assignment.estimated_time_minutes} min</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isPastDue && !submission && <Badge variant="destructive">Past due</Badge>}
            {submission ? (
              <Badge variant="default" className="gap-1">
                <CheckCircle className="h-3 w-3" />
                {submission.graded_at ? `${submission.grade}/${assignment.points}` : "Submitted"}
              </Badge>
            ) : (
              <Badge variant="secondary">Not submitted</Badge>
            )}
          </div>
        </div>
        {assignment.description && (
          <p className="mt-3 text-sm text-muted-foreground">{assignment.description}</p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Assignment details & files */}
        <div className="space-y-6">
          {/* Assignment Files from teacher */}
          {assets.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Assignment Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {assets.map((asset) => {
                  const url = asset.file_url || asset.link_url;
                  const isPdf = asset.file_name && /\.pdf$/i.test(asset.file_name);
                  const isImage = asset.file_name && /\.(png|jpg|jpeg|gif|webp)$/i.test(asset.file_name);
                  return (
                    <div key={asset.id} className="space-y-2">
                      <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {asset.file_url ? <FileText className="h-4 w-4 text-primary shrink-0" /> : <ExternalLink className="h-4 w-4 text-primary shrink-0" />}
                          <span className="text-sm font-medium truncate">{asset.file_name || asset.link_url}</span>
                        </div>
                        <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-xs shrink-0">
                          <a href={url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3" /> Download</a>
                        </Button>
                      </div>
                      {isPdf && (
                        <iframe
                          src={`https://docs.google.com/gview?url=${encodeURIComponent(url)}&embedded=true`}
                          className="w-full rounded-lg border bg-muted/30"
                          style={{ height: "400px" }}
                          title={`Preview ${asset.file_name}`}
                        />
                      )}
                      {isImage && (
                        <img src={url} alt={asset.file_name} className="w-full max-h-[400px] object-contain rounded-lg border bg-muted/30" />
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}

          {/* Submission preview if already submitted */}
          {submission?.file_url && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Your Submitted File</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{submission.file_name || "File"}</span>
                  </div>
                  <Button variant="outline" size="sm" asChild className="h-7 gap-1 text-xs">
                    <a href={submission.file_url} target="_blank" rel="noreferrer" download><Download className="h-3 w-3" /> Download</a>
                  </Button>
                </div>
                {submission.file_name && /\.pdf$/i.test(submission.file_name) && (
                  <iframe
                    src={`https://docs.google.com/gview?url=${encodeURIComponent(submission.file_url)}&embedded=true`}
                    className="w-full rounded-lg border bg-muted/30"
                    style={{ height: "400px" }}
                    title="Your submission preview"
                  />
                )}
                {submission.file_name && /\.(png|jpg|jpeg|gif|webp)$/i.test(submission.file_name) && (
                  <img src={submission.file_url} alt={submission.file_name} className="w-full max-h-[400px] object-contain rounded-lg border bg-muted/30" />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Submission / Grade panel + AI Help */}
        <div className="space-y-6">
          {submission ? (
            <>
              {/* Existing submission details */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Your Submission</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Submitted on {new Date(submission.submitted_at).toLocaleString()}
                  </p>
                  {submission.text_content && (
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Your Response</p>
                      <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                        {submission.text_content}
                      </div>
                    </div>
                  )}
                  {!submission.text_content && !submission.file_url && (
                    <p className="text-sm text-muted-foreground italic">Empty submission</p>
                  )}
                </CardContent>
              </Card>

              {/* Grade card */}
              {submission.graded_at && (
                <Card className="border-primary/20">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Grade & Feedback</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Score</span>
                      <span className="text-2xl font-bold text-primary">{submission.grade}<span className="text-sm text-muted-foreground font-normal">/{assignment.points}</span></span>
                    </div>
                    {submission.feedback && (
                      <div>
                        <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Feedback</p>
                        <div className="rounded-lg bg-muted p-4 text-sm whitespace-pre-wrap">
                          {submission.feedback}
                        </div>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      Graded on {new Date(submission.graded_at).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            /* Submission form */
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Submit Assignment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Your Response</Label>
                  <Textarea
                    placeholder="Write your answer or notes..."
                    value={submissionText}
                    onChange={(e) => setSubmissionText(e.target.value)}
                    rows={6}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Attach File (optional)</Label>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="sub-file-upload" className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors">
                      <Upload className="h-4 w-4" /> Choose File
                    </Label>
                    <input id="sub-file-upload" type="file" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} disabled={submitting} />
                    {selectedFile && <span className="text-sm text-muted-foreground truncate max-w-[200px]">{selectedFile.name}</span>}
                  </div>
                </div>

                {/* Preview selected file */}
                {selectedFile && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Preview</p>
                    {/\.(png|jpg|jpeg|gif|webp)$/i.test(selectedFile.name) && (
                      <img
                        src={URL.createObjectURL(selectedFile)}
                        alt={selectedFile.name}
                        className="w-full max-h-[300px] object-contain rounded-lg border bg-muted/30"
                      />
                    )}
                    {/\.pdf$/i.test(selectedFile.name) && (
                      <iframe
                        src={URL.createObjectURL(selectedFile)}
                        className="w-full rounded-lg border bg-muted/30"
                        style={{ height: "350px" }}
                        title="File preview"
                      />
                    )}
                    {!/\.(png|jpg|jpeg|gif|webp|pdf)$/i.test(selectedFile.name) && (
                      <div className="flex items-center gap-2 rounded-lg border p-3 bg-muted/30">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm">{selectedFile.name}</span>
                      </div>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)} className="text-xs text-destructive">
                      Remove file
                    </Button>
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  disabled={submitting || (!submissionText.trim() && !selectedFile)}
                  className="w-full gap-2"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                  Submit Assignment
                </Button>
              </CardContent>
            </Card>
          )}

          {/* AI Assignment Helper */}
          <Card className="border-primary/30">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setAiOpen(!aiOpen)}>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                AI Assignment Helper
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {aiOpen ? "Collapse" : "Expand"}
                </Badge>
              </CardTitle>
              <p className="text-xs text-muted-foreground">Ask for help understanding this assignment</p>
            </CardHeader>
            {aiOpen && (
              <CardContent className="space-y-3 pt-0">
                {/* Messages */}
                {aiMessages.length > 0 && (
                  <div ref={aiScrollRef} className="max-h-[350px] overflow-y-auto space-y-3 rounded-lg border bg-muted/20 p-3">
                    {aiMessages.map((msg, i) => (
                      <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        {msg.role === "assistant" && <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />}
                        <div className={`rounded-lg px-3 py-2 text-sm max-w-[85%] ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border"
                        }`}>
                          {msg.role === "assistant" ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-1 [&>ul]:my-1">
                              <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                          ) : msg.content}
                        </div>
                      </div>
                    ))}
                    {aiLoading && !aiMessages.find((m, i) => i === aiMessages.length - 1 && m.role === "assistant") && (
                      <div className="flex gap-2">
                        <Bot className="h-5 w-5 text-primary shrink-0" />
                        <div className="rounded-lg border bg-card px-3 py-2">
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Input */}
                <form
                  onSubmit={(e) => { e.preventDefault(); sendAiMessage(); }}
                  className="flex gap-2"
                >
                  <Input
                    placeholder="e.g. Help me understand this assignment..."
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    disabled={aiLoading}
                    className="flex-1 text-sm"
                  />
                  <Button type="submit" size="sm" disabled={aiLoading || !aiInput.trim()} className="gap-1 shrink-0">
                    {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </form>

                {aiMessages.length === 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {["Explain this assignment", "Give me an outline to start", "What concepts should I review?"].map(q => (
                      <button
                        key={q}
                        onClick={() => { setAiInput(q); }}
                        className="rounded-full border px-3 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
