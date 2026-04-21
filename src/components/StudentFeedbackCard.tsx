import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Brain, Loader2, ChevronDown, ChevronUp, Flame, Eye, MousePointerClick, FileCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface StudentFeedbackCardProps {
  student: {
    student_id: string;
    enrolled_at: string;
    profiles: { name: string; major: string } | null;
  };
  courseId: string;
  assignments: any[];
  submissions: Record<string, any[]>;
  effort?: {
    reel_views_count: number;
    course_page_views_count: number;
    submissions_count: number;
  };
}

export function StudentFeedbackCard({ student, courseId, assignments, submissions, effort }: StudentFeedbackCardProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Gather this student's submission data
  const getStudentContext = () => {
    const studentSubs: { assignment: string; grade: number | null; submitted: boolean; late: boolean }[] = [];
    for (const a of assignments) {
      const subs = submissions[a.id] || [];
      const sub = subs.find((s: any) => s.student_id === student.student_id);
      studentSubs.push({
        assignment: a.title,
        grade: sub?.grade ?? null,
        submitted: !!sub,
        late: sub && a.due_date ? new Date(sub.submitted_at) > new Date(a.due_date) : false,
      });
    }
    return studentSubs;
  };

  const generateFeedback = async () => {
    setLoading(true);
    setExpanded(true);
    const studentContext = getStudentContext();
    const totalAssignments = assignments.length;
    const submitted = studentContext.filter(s => s.submitted).length;
    const graded = studentContext.filter(s => s.grade !== null);
    const avgGrade = graded.length > 0 ? (graded.reduce((sum, s) => sum + (s.grade || 0), 0) / graded.length).toFixed(1) : "N/A";
    const lateCount = studentContext.filter(s => s.late).length;

    const prompt = `Give a brief, constructive feedback summary for this student in the course. Include strengths, areas for improvement, and actionable suggestions. Be specific based on the data.

Student: ${student.profiles?.name || "Unknown"}
Major: ${student.profiles?.major || "Not specified"}
Enrolled: ${new Date(student.enrolled_at).toLocaleDateString()}

Assignment Performance:
- Total assignments: ${totalAssignments}
- Submitted: ${submitted}/${totalAssignments}
- Average grade: ${avgGrade}
- Late submissions: ${lateCount}

Details:
${studentContext.map(s => `- ${s.assignment}: ${s.submitted ? `Submitted${s.grade !== null ? `, Grade: ${s.grade}` : ", Not graded yet"}${s.late ? " (Late)" : ""}` : "Not submitted"}`).join("\n")}

Keep the feedback to 3-4 short paragraphs. Use markdown formatting.`;

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: prompt }],
            courseId,
            action: "teacher",
            userToken: token,
          }),
        }
      );

      if (!response.ok || !response.body) {
        setFeedback("Failed to generate feedback. Please try again.");
        setLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let result = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              result += content;
              setFeedback(result);
            }
          } catch { /* partial chunk */ }
        }
      }

      if (!result) setFeedback("No feedback generated.");
    } catch (err) {
      console.error("Feedback error:", err);
      setFeedback("An error occurred while generating feedback.");
    }
    setLoading(false);
  };

  const submitted = assignments.length > 0
    ? (submissions ? Object.values(submissions).flat().filter((s: any) => s.student_id === student.student_id).length : 0)
    : 0;

  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {(student.profiles?.name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{student.profiles?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{student.profiles?.major || "No major"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {submitted}/{assignments.length} submitted
            </Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={feedback ? () => setExpanded(!expanded) : generateFeedback}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Brain className="h-3.5 w-3.5" />
              )}
              {feedback ? (expanded ? "Hide" : "Show") : "AI Feedback"}
              {feedback && !loading && (expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
            </Button>
          </div>
        </div>

        {effort && (() => {
          // Effort score: weighted blend, capped at 100. Tunable.
          // reel views (cap 10) -> 30, page views (cap 30) -> 35, submissions vs assignments -> 35
          const reelPart = Math.min(effort.reel_views_count, 10) / 10 * 30;
          const pagePart = Math.min(effort.course_page_views_count, 30) / 30 * 35;
          const submitPart = assignments.length > 0
            ? Math.min(effort.submissions_count / assignments.length, 1) * 35
            : (effort.submissions_count > 0 ? 35 : 0);
          const score = Math.round(reelPart + pagePart + submitPart);
          const tier = score >= 75 ? { label: "On fire", cls: "text-success" }
            : score >= 50 ? { label: "Engaged", cls: "text-primary" }
            : score >= 25 ? { label: "Building", cls: "text-warning" }
            : { label: "Low effort", cls: "text-destructive" };
          return (
            <div className="mt-3 rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Flame className={`h-4 w-4 ${tier.cls}`} />
                  <span className="text-sm font-medium">Effort Score</span>
                  <span className={`text-xs font-semibold ${tier.cls}`}>{tier.label}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums">{score}/100</span>
              </div>
              <Progress value={score} className="h-2" />
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> {effort.reel_views_count} reels watched</span>
                <span className="inline-flex items-center gap-1"><MousePointerClick className="h-3 w-3" /> {effort.course_page_views_count} course visits</span>
                <span className="inline-flex items-center gap-1"><FileCheck className="h-3 w-3" /> {effort.submissions_count} submissions</span>
              </div>
            </div>
          );
        })()}

        {expanded && feedback && (
          <div className="mt-4 rounded-lg border bg-muted/30 p-4">
            <div className="prose prose-sm max-w-none text-sm text-foreground">
              <ReactMarkdown>{feedback}</ReactMarkdown>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 text-xs"
              onClick={generateFeedback}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Brain className="mr-1 h-3 w-3" />}
              Regenerate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
