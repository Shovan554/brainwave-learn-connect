import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, User, ArrowLeft } from "lucide-react";

export default function PublicProfile() {
  const { studentId } = useParams<{ studentId: string }>();
  const [profile, setProfile] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    const load = async () => {
      const [profileRes, projectsRes] = await Promise.all([
        supabase.from("profiles").select("name, bio, major").eq("user_id", studentId).single(),
        supabase.from("project_portfolios").select("*").eq("student_id", studentId).order("created_at", { ascending: false }),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (projectsRes.data) setProjects(projectsRes.data);
      setLoading(false);
    };
    load();
  }, [studentId]);

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></DashboardLayout>;
  }

  if (!profile) {
    return <DashboardLayout><p>Profile not found.</p></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {profile.name?.charAt(0)?.toUpperCase() || <User className="h-6 w-6" />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{profile.name}</h1>
            {profile.major && <p className="text-muted-foreground">{profile.major}</p>}
          </div>
        </div>

        {profile.bio && (
          <Card className="mb-6">
            <CardContent className="p-4">
              <p className="text-sm">{profile.bio}</p>
            </CardContent>
          </Card>
        )}

        <h2 className="mb-4 text-lg font-semibold">Portfolio</h2>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet</p>
        ) : (
          <div className="space-y-4">
            {projects.map((p) => (
              <Card key={p.id}>
                <CardContent className="p-4">
                  <p className="font-medium">{p.title}</p>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                  {p.github_url && (
                    <a href={p.github_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline">
                      <ExternalLink className="h-3 w-3" /> GitHub
                    </a>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {(p.tech_stack || []).map((t: string) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
