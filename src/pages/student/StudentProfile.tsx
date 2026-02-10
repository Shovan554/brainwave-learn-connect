import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ExternalLink, Save } from "lucide-react";

export default function StudentProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({ name: "", bio: "", major: "" });
  const [projects, setProjects] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", github_url: "", tech_stack: "" });

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const [profileRes, projectsRes] = await Promise.all([
      supabase.from("profiles").select("name, bio, major").eq("user_id", user!.id).single(),
      supabase.from("project_portfolios").select("*").eq("student_id", user!.id).order("created_at", { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data as any);
    if (projectsRes.data) setProjects(projectsRes.data);
  };

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update(profile).eq("user_id", user!.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else toast({ title: "Profile saved" });
    setSaving(false);
  };

  const addProject = async () => {
    if (!user || !newProject.title) return;
    const { error } = await supabase.from("project_portfolios").insert({
      student_id: user.id,
      title: newProject.title,
      description: newProject.description,
      github_url: newProject.github_url,
      tech_stack: newProject.tech_stack.split(",").map((s) => s.trim()).filter(Boolean),
    });
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setNewProject({ title: "", description: "", github_url: "", tech_stack: "" });
    loadData();
  };

  const deleteProject = async (id: string) => {
    await supabase.from("project_portfolios").delete().eq("id", id);
    loadData();
  };

  return (
    <DashboardLayout>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">My Profile</h1>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Profile Info</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Major</Label>
                <Input value={profile.major || ""} onChange={(e) => setProfile({ ...profile, major: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={3} />
            </div>
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Profile
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Portfolio Projects</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 rounded-lg border p-4">
              <Input placeholder="Project title" value={newProject.title} onChange={(e) => setNewProject({ ...newProject, title: e.target.value })} />
              <Textarea placeholder="Description" value={newProject.description} onChange={(e) => setNewProject({ ...newProject, description: e.target.value })} rows={2} />
              <Input placeholder="GitHub URL" value={newProject.github_url} onChange={(e) => setNewProject({ ...newProject, github_url: e.target.value })} />
              <Input placeholder="Tech stack (comma-separated)" value={newProject.tech_stack} onChange={(e) => setNewProject({ ...newProject, tech_stack: e.target.value })} />
              <Button size="sm" onClick={addProject} disabled={!newProject.title}>
                <Plus className="mr-2 h-3 w-3" /> Add Project
              </Button>
            </div>

            {projects.map((p) => (
              <div key={p.id} className="flex items-start justify-between rounded-lg border p-4">
                <div>
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
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteProject(p.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
