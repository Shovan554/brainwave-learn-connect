import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  userToken: string | null;
}

export function AIDashboardInsight({ userToken }: Props) {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  const fetchInsight = async () => {
    if (!userToken) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("dashboard-insight", {
        body: { userToken },
      });
      if (data?.insight) {
        setInsight(data.insight);
      }
    } catch (e) {
      console.error("Failed to fetch AI insight:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, [userToken]);

  if (dismissed) return null;

  return (
    <Card className="mb-6 border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-transparent overflow-hidden relative">
      <CardContent className="p-4 flex items-start gap-3">
        <div className="shrink-0 mt-0.5 rounded-lg bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">AI Advisor</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : insight ? (
            <p className="text-sm text-foreground/90 leading-relaxed">{insight}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Unable to load suggestions right now.</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-primary"
            onClick={() => fetchInsight()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => setDismissed(true)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
