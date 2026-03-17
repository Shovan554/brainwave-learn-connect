import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, ExternalLink, Save, Camera, Heart, MessageCircle, Image as ImageIcon, Send } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function StudentProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({ name: "", bio: "", major: "", avatar_url: "" });
  const [projects, setProjects] = useState<any[]>([]);
  const [myPosts, setMyPosts] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [newProject, setNewProject] = useState({ title: "", description: "", github_url: "", tech_stack: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comments state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const loadData = async () => {
    const [profileRes, projectsRes, postsRes] = await Promise.all([
      supabase.from("profiles").select("name, bio, major, avatar_url").eq("user_id", user!.id).single(),
      supabase.from("project_portfolios").select("*").eq("student_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("posts").select("*").eq("author_id", user!.id).order("created_at", { ascending: false }),
    ]);
    if (profileRes.data) setProfile(profileRes.data as any);
    if (projectsRes.data) setProjects(projectsRes.data);
    if (postsRes.data) setMyPosts(postsRes.data);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Please select an image file", variant: "destructive" });
      return;
    }

    setUploadingAvatar(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
      const avatarUrl = urlData.publicUrl;

      const { error: updateErr } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("user_id", user.id);
      if (updateErr) throw updateErr;

      setProfile(prev => ({ ...prev, avatar_url: avatarUrl }));
      toast({ title: "Profile photo updated!" });
    } catch {
      toast({ title: "Failed to upload photo", variant: "destructive" });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      name: profile.name,
      bio: profile.bio,
      major: profile.major,
    }).eq("user_id", user!.id);
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

  const deletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    await supabase.from("posts").delete().eq("id", postId);
    setMyPosts(prev => prev.filter(p => p.id !== postId));
    toast({ title: "Post deleted" });
  };

  const openComments = async (postId: string) => {
    setCommentsPostId(postId);
    setCommentsOpen(true);
    setLoadingComments(true);
    const { data } = await supabase
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (data) {
      const authorIds = [...new Set(data.map((c: any) => c.author_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, avatar_url")
        .in("user_id", authorIds);
      const profileMap = Object.fromEntries(profiles?.map((p: any) => [p.user_id, p]) || []);
      setComments(data.map((c: any) => ({
        ...c,
        author_name: profileMap[c.author_id]?.name || "User",
        author_avatar: profileMap[c.author_id]?.avatar_url || null,
      })));
    }
    setLoadingComments(false);
  };

  const sendComment = async () => {
    if (!user || !commentsPostId || !newComment.trim()) return;
    setSendingComment(true);
    try {
      const { data } = await supabase
        .from("post_comments")
        .insert({ post_id: commentsPostId, author_id: user.id, content: newComment.trim() })
        .select()
        .single();
      if (data) {
        setComments(prev => [...prev, { ...data, author_name: profile.name || "You", author_avatar: profile.avatar_url || null }]);
        setMyPosts(prev => prev.map(p => p.id === commentsPostId ? { ...p, comments_count: p.comments_count + 1 } : p));
      }
      setNewComment("");
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    } finally {
      setSendingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("post_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    if (commentsPostId) {
      setMyPosts(prev => prev.map(p => p.id === commentsPostId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p));
    }
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
            <div className="flex items-center gap-4">
              <div className="relative group">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={profile.avatar_url || undefined} alt={profile.name} />
                  <AvatarFallback className="text-xl bg-primary/10 text-primary">
                    {profile.name?.charAt(0)?.toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                  className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  ) : (
                    <Camera className="h-5 w-5 text-white" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
              </div>
              <div>
                <p className="text-sm font-medium">Profile Photo</p>
                <p className="text-xs text-muted-foreground">Click to upload a new photo</p>
              </div>
            </div>

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
        {/* Your Posts section */}
        <Card>
          <CardHeader><CardTitle className="text-base">Your Posts</CardTitle></CardHeader>
          <CardContent>
            {myPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">You haven't posted anything yet.</p>
            ) : (
              <div className="space-y-4">
                {myPosts.map(post => (
                  <div key={post.id} className="rounded-xl border overflow-hidden">
                    <div className="p-4">
                      <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                    </div>
                    {post.image_url && (
                      <img src={post.image_url} alt="Post" className="w-full max-h-[300px] object-cover" />
                    )}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-border/50">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {post.likes_count}</span>
                        <button onClick={() => openComments(post.id)} className="flex items-center gap-1 hover:text-primary transition-colors">
                          <MessageCircle className="h-3 w-3" /> {post.comments_count}
                        </button>
                        <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deletePost(post.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comments Dialog */}
      <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Comments</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[400px]">
            {loadingComments ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : comments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2.5 group">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={c.author_avatar || undefined} />
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {c.author_name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="bg-muted rounded-xl px-3 py-2">
                        <p className="text-xs font-semibold">{c.author_name}</p>
                        <p className="text-sm">{c.content}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 px-1">
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </span>
                        {c.author_id === user?.id && (
                          <button onClick={() => deleteComment(c.id)} className="text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <div className="flex gap-2 mt-2">
            <Input
              placeholder="Write a comment..."
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendComment(); } }}
              className="rounded-xl"
            />
            <Button size="icon" onClick={sendComment} disabled={sendingComment || !newComment.trim()} className="rounded-xl shrink-0">
              {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
