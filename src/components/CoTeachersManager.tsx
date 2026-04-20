import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, Trash2, Crown } from "lucide-react";

interface Props {
  courseId: string;
  primaryTeacherId: string;
  currentUserId: string;
}

interface TeacherRow {
  id?: string; // course_teachers row id (undefined for primary)
  teacher_id: string;
  name: string;
  isPrimary: boolean;
}

export function CoTeachersManager({ courseId, primaryTeacherId, currentUserId }: Props) {
  const { toast } = useToast();
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);

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

    const list: TeacherRow[] = [
      { teacher_id: primaryTeacherId, name: primaryRes.data?.name || "Primary Teacher", isPrimary: true },
      ...co.map((c: any) => ({
        id: c.id,
        teacher_id: c.teacher_id,
        name: profMap.get(c.teacher_id) || "Unknown",
        isPrimary: false,
      })),
    ];
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [courseId, primaryTeacherId]);

  const addCoTeacher = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setAdding(true);
    try {
      // Find profile by name match OR ask user to provide name. We don't have email in profiles,
      // so search profiles by name (case-insensitive) as a fallback.
      const { data: matches } = await supabase
        .from("profiles")
        .select("user_id, name")
        .ilike("name", `%${trimmed}%`)
        .limit(5);

      if (!matches || matches.length === 0) {
        toast({ title: "No teacher found", description: "Enter the teacher's exact name as it appears on their profile.", variant: "destructive" });
        return;
      }
      if (matches.length > 1) {
        toast({ title: "Multiple matches", description: `Found ${matches.length} profiles. Be more specific.`, variant: "destructive" });
        return;
      }
      const target = matches[0];
      if (target.user_id === primaryTeacherId || rows.some((r) => r.teacher_id === target.user_id)) {
        toast({ title: "Already a teacher", description: `${target.name} is already on this course.`, variant: "destructive" });
        return;
      }

      // Verify they have the teacher role
      const { data: roleRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", target.user_id)
        .eq("role", "teacher")
        .maybeSingle();
      if (!roleRow) {
        toast({ title: "Not a teacher", description: `${target.name} does not have a teacher account.`, variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("course_teachers").insert({
        course_id: courseId,
        teacher_id: target.user_id,
        added_by: currentUserId,
      });
      if (error) throw error;
      toast({ title: "Co-teacher added", description: `${target.name} can now manage this course.` });
      setEmail("");
      await load();
    } catch (e: any) {
      toast({ title: "Failed to add", description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            placeholder="Teacher's name (as on their profile)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCoTeacher()}
          />
          <Button onClick={addCoTeacher} disabled={adding || !email.trim()}>
            {adding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
            Add
          </Button>
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
