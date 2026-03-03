import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Brain, BookmarkPlus, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface AssetSummaryDialogProps {
  fileUrl: string;
  fileName: string;
  courseId?: string;
  courseTitle?: string;
}

export function AssetSummaryDialog({ fileUrl, fileName, courseId, courseTitle }: AssetSummaryDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadSummary = async () => {
    if (summary) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("summarize-asset", {
        body: { fileUrl, fileName },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSummary(data.summary);
    } catch (e: any) {
      setError(e.message || "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  const saveToReadings = async () => {
    if (!user || !summary || !courseId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("saved_summaries").insert({
        student_id: user.id,
        course_id: courseId,
        course_title: courseTitle || "",
        file_name: fileName,
        file_url: fileUrl,
        summary,
      });
      if (error) {
        if (error.message.includes("duplicate")) {
          toast({ title: "Already saved", description: "This summary is already in your readings." });
          setSaved(true);
        } else {
          throw error;
        }
      } else {
        setSaved(true);
        toast({ title: "Saved to My Readings!" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !summary) loadSummary();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleOpen(true);
        }}
      >
        <Brain className="h-3 w-3" />
        Summary
      </Button>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Brain className="h-4 w-4 text-primary" />
            AI Summary — {fileName}
          </DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reading and summarizing…</p>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={loadSummary}>
              Retry
            </Button>
          </div>
        )}
        {summary && (
          <>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
            {courseId && (
              <div className="flex justify-end border-t pt-3">
                <Button
                  variant={saved ? "secondary" : "default"}
                  size="sm"
                  className="gap-2"
                  onClick={saveToReadings}
                  disabled={saving || saved}
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : saved ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <BookmarkPlus className="h-4 w-4" />
                  )}
                  {saved ? "Saved" : "Save to My Readings"}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
