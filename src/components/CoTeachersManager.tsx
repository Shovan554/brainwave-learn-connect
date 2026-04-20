import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Trash2, Crown, Search } from "lucide-react";

interface Props {
  courseId: string;
  primaryTeacherId: string;
  currentUserId: string;
}

interface TeacherRow {
  id?: string;
  teacher_id: string;
  name: string;
  isPrimary: boolean;
}

interface SearchResult {
  user_id: string;
  name: string;
}

export function CoTeachersManager({ courseId, primaryTeacherId, currentUserId }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    setLoading(true);
    const [primaryRes, coRes] = await Promise.all([
      supabase.from("profiles").select("user_id, name").eq("user_id", primaryTeacherId).maybeSingle(),
      supabase.from("course_teachers").select("id, teacher_id").eq("course_id", courseId),
    ]);

    const co = coRes.data || [];
    const ids = co.map((c: any) => c.teacher_id);
    let profiles: any[] = [];
    if (ids.length > 0) {
      const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      profiles = data || [];
    }
    const profMap = new Map(profiles.map((p) => [p.user_id, p.name]));

    setRows([
      { teacher_id: primaryTeacherId, name: primaryRes.data?.name || "Primary Teacher", isPrimary: true },
      ...co.map((c: any) => ({
        id: c.id,
        teacher_id: c.teacher_id,
        name: profMap.get(c.teacher_id) || "Unknown",
        isPrimary: false,
      })),
    ]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [courseId, primaryTeacherId]);

  // Debounced search across teacher profiles
  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      // Get all teacher user_ids
      const { data: teacherRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "teacher");
      const teacherIds = (teacherRoles || []).map((r: any) => r.user_id);
      if (teacherIds.length === 0) {
        setResults([]); setSearching(false); return;
      }
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, name")
        .in("user_id", teacherIds)
        .ilike("name", `%${q}%`)
        .limit(8);
      // Exclude already-added
      const taken = new Set(rows.map((r) => r.teacher_id));
      setResults((profs || []).filter((p) => !taken.has(p.user_id)));
      setSearching(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, rows]);

  // Close dropdown on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const addCoTeacher = async (target: SearchResult) => {
    setAdding(target.user_id);
    try {
      const { error } = await supabase.from("course_teachers").insert({
        course_id: courseId,
        teacher_id: target.user_id,
        added_by: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Co-teacher added", description: `${target.name} can now manage this course.` });
      setQuery(""); setResults([]); setOpen(false);
      await load();
    } catch (e: any) {
      toast({ title: "Failed to add", description: e.message, variant: "destructive" });
    } finally {
      setAdding(null);
    }
  };

  const remove = async (row: TeacherRow) => {
    if (!row.id) return;
    if (!confirm(`Remove ${row.name} as co-teacher?`)) return;
    const { error } = await supabase.from("course_teachers").delete().eq("id", row.id);
    if (error) {
      toast({ title: "Failed to remove", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Removed" });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Co-Professors</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div ref={wrapRef} className="relative">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search teachers by name..."
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
            />
          </div>
          {open && query.trim() && (
            <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover shadow-lg">
              {searching ? (
                <div className="flex items-center justify-center gap-2 p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Searching...
                </div>
              ) : results.length === 0 ? (
                <div className="p-3 text-sm text-muted-foreground">No matching teachers found.</div>
              ) : (
                results.map((r) => (
                  <button
                    key={r.user_id}
                    onClick={() => addCoTeacher(r)}
                    disabled={adding === r.user_id}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-50"
                  >
                    <span className="font-medium">{r.name}</span>
                    {adding === r.user_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Co-professors get full management rights: edit content, grade submissions, manage assignments.
        </p>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.teacher_id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{r.name}</span>
                  {r.isPrimary && (
                    <Badge variant="secondary" className="gap-1"><Crown className="h-3 w-3" /> Primary</Badge>
                  )}
                </div>
                {!r.isPrimary && (
                  <Button variant="ghost" size="sm" onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
