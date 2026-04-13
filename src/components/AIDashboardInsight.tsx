import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, RefreshCw, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const STORAGE_KEY = "ai-dashboard-insight";

interface Props {
  userToken: string | null;
}

export function AIDashboardInsight({ userToken }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Load cached insight on mount
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      setInsight(cached);
    }
  }, []);

  const fetchInsight = async () => {
    if (!userToken) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("dashboard-insight", {
        body: { userToken },
      });
      if (data?.insight) {
        setInsight(data.insight);
        localStorage.setItem(STORAGE_KEY, data.insight);
      }
    } catch (e) {
      console.error("Failed to fetch AI insight:", e);
    } finally {
      setLoading(false);
    }
  };

  if (dismissed) return null;

  return (
    <div className="mb-6 flex items-start gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3">
      <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        {loading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        ) : insight ? (
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown>{insight}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Click generate to get personalized advice from your AI advisor.</p>
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-primary"
          onClick={fetchInsight}
          disabled={loading}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          {insight ? "Regenerate" : "Generate"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={() => setDismissed(true)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
