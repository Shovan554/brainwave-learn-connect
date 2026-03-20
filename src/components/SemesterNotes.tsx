import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { BookOpen, Download, RefreshCw, Loader2, Sparkles, Clock } from "lucide-react";

interface SemesterNotesProps {
  courseId: string;
  courseTitle: string;
  isTeacher?: boolean;
}

export function SemesterNotes({ courseId, courseTitle, isTeacher }: SemesterNotesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadNotes();
  }, [courseId]);

  const loadNotes = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("course_notes" as any)
      .select("*")
      .eq("course_id", courseId)
      .maybeSingle();
    setNotes(data);
    setLoading(false);
  };

  const generateNotes = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-course-notes", {
        body: { courseId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Notes generated!", description: "Semester notes have been created successfully." });
      loadNotes();
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate notes", variant: "destructive" });
    }
    setGenerating(false);
  };

  const downloadNotes = () => {
    if (!notes?.content) return;
    const blob = new Blob([notes.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${courseTitle.replace(/[^a-zA-Z0-9]/g, "_")}_Semester_Notes.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Semester Lecture Notes
                <Sparkles className="h-4 w-4 text-amber-500" />
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI-generated comprehensive summary of all course content
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notes?.content && (
              <Button variant="outline" size="sm" onClick={downloadNotes} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            )}
            {isTeacher && (
              <Button
                size="sm"
                onClick={generateNotes}
                disabled={generating}
                className="gap-1.5"
              >
                {generating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : notes?.content ? (
                  <RefreshCw className="h-3.5 w-3.5" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {generating ? "Generating..." : notes?.content ? "Regenerate" : "Generate Notes"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!notes?.content ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/50 mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">No semester notes yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
              {isTeacher
                ? "Click 'Generate Notes' to create comprehensive AI-powered lecture notes from all weekly content."
                : "Your teacher hasn't generated semester notes for this course yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.generated_at && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="h-3 w-3" />
                  Last generated: {new Date(notes.generated_at).toLocaleDateString(undefined, {
                    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </Badge>
              </div>
            )}
            <ScrollArea className="max-h-[600px] rounded-lg border bg-card p-5">
              <article className="prose prose-sm dark:prose-invert max-w-none 
                prose-headings:text-foreground prose-headings:font-semibold
                prose-h1:text-xl prose-h1:border-b prose-h1:pb-2 prose-h1:mb-4
                prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2
                prose-h3:text-base prose-h3:mt-4
                prose-p:text-muted-foreground prose-p:leading-relaxed
                prose-li:text-muted-foreground
                prose-strong:text-foreground
                prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1 prose-code:rounded
              ">
                <ReactMarkdown>{notes.content}</ReactMarkdown>
              </article>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
