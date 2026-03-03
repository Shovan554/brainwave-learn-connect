import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BookOpen, Trash2, Brain, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";

interface SavedSummary {
  id: string;
  course_id: string;
  course_title: string;
  file_name: string;
  file_url: string;
  summary: string;
  created_at: string;
}

export default function MyReadings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewSummary, setViewSummary] = useState<SavedSummary | null>(null);

  useEffect(() => {
    if (!user) return;
    loadSummaries();
  }, [user]);

  const loadSummaries = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("saved_summaries")
      .select("*")
      .eq("student_id", user!.id)
      .order("created_at", { ascending: false });
    setSummaries((data as SavedSummary[]) || []);
    setLoading(false);
  };

  const deleteSummary = async (id: string) => {
    const { error } = await supabase.from("saved_summaries").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setSummaries((prev) => prev.filter((s) => s.id !== id));
      toast({ title: "Removed from readings" });
    }
  };

  // Group by course
  const grouped = summaries.reduce<Record<string, { title: string; items: SavedSummary[] }>>((acc, s) => {
    if (!acc[s.course_id]) acc[s.course_id] = { title: s.course_title || "Unknown Course", items: [] };
    acc[s.course_id].items.push(s);
    return acc;
  }, {});

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BookOpen className="h-6 w-6 text-primary" />
          My Readings
        </h1>
        <p className="text-muted-foreground">Saved summaries organized by course</p>
      </motion.div>

      {summaries.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <Brain className="mb-3 h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No saved readings yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Open a file summary in your course and click "Save to My Readings"
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([courseId, { title, items }]) => (
            <motion.div key={courseId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <h2 className="mb-3 text-lg font-semibold">{title}</h2>
              <div className="space-y-2">
                {items.map((s) => (
                  <Card key={s.id} className="group transition-all hover:shadow-md">
                    <CardContent className="flex items-center justify-between p-4">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => setViewSummary(s)}
                      >
                        <Brain className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="font-medium truncate">{s.file_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Saved {new Date(s.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => deleteSummary(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* View summary dialog */}
      <Dialog open={!!viewSummary} onOpenChange={(o) => !o && setViewSummary(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Brain className="h-4 w-4 text-primary" />
              {viewSummary?.file_name}
            </DialogTitle>
          </DialogHeader>
          {viewSummary && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{viewSummary.summary}</ReactMarkdown>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
