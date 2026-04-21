import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, Play, Plus, Film, Volume2, VolumeX, Send, Search, Loader2, Users, RotateCcw, Link, Sparkles, Check, X, BookOpen, Trash2, Pencil } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { GeneratedReelCard } from "@/components/GeneratedReelCard";
import { toast } from "sonner";

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
    /youtu\.be\/([a-zA-Z0-9_-]+)/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function isYouTubeUrl(url: string): boolean {
  return !!extractYouTubeId(url);
}

function extractTikTokId(url: string): string | null {
  const patterns = [
    /tiktok\.com\/@[^/]+\/video\/(\d+)/,
    /tiktok\.com\/v\/(\d+)/,
    /vm\.tiktok\.com\/([A-Za-z0-9]+)/,
    /vt\.tiktok\.com\/([A-Za-z0-9]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function isTikTokUrl(url: string): boolean {
  return /tiktok\.com/.test(url);
}

function isGeneratedReel(url: string): boolean {
  return url.startsWith("generated://");
}

function parseGeneratedContent(url: string): { hook: string; script: string; color_theme: string } | null {
  if (!url.startsWith("generated://")) return null;
  try {
    return JSON.parse(decodeURIComponent(url.slice("generated://".length)));
  } catch {
    return null;
  }
}

const GENERATED_COLORS: Record<string, { bg: string; accent: string }> = {
  blue: { bg: "from-blue-600 via-blue-800 to-indigo-900", accent: "text-blue-200" },
  purple: { bg: "from-purple-600 via-purple-800 to-indigo-900", accent: "text-purple-200" },
  green: { bg: "from-emerald-600 via-emerald-800 to-teal-900", accent: "text-emerald-200" },
  orange: { bg: "from-orange-500 via-orange-700 to-red-900", accent: "text-orange-200" },
  red: { bg: "from-red-500 via-red-700 to-rose-900", accent: "text-red-200" },
  pink: { bg: "from-pink-500 via-pink-700 to-purple-900", accent: "text-pink-200" },
};

interface ReelSuggestion {
  title: string;
  script: string;
  hook: string;
  topic: string;
  color_theme: string;
}

interface Reel {
  id: string;
  uploaded_by: string;
  title: string;
  description: string | null;
  video_url: string;
  thumbnail_url: string | null;
  likes_count: number;
  views_count: number;
  created_at: string;
  course_id: string | null;
  uploader_name?: string;
  liked_by_me?: boolean;
}

interface ShareContact {
  conversation_id: string;
  user_id: string;
  name: string;
  avatar_url?: string;
  isGroup?: boolean;
}

export default function Reels() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const [reels, setReels] = useState<Reel[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadCourseId, setUploadCourseId] = useState<string>("");
  const [uploadYoutubeUrl, setUploadYoutubeUrl] = useState("");
  const [uploadMode, setUploadMode] = useState<"file" | "youtube" | "tiktok" | "generate">("youtube");
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateCourseId, setGenerateCourseId] = useState("");
  const [suggestions, setSuggestions] = useState<ReelSuggestion[]>([]);
  const [publishingSuggestion, setPublishingSuggestion] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingStates, setPlayingStates] = useState<Record<number, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});
  const [showViewed, setShowViewed] = useState(false);

  // Teacher courses for upload selector
  const [teacherCourses, setTeacherCourses] = useState<{ id: string; title: string }[]>([]);

  // Share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [shareContacts, setShareContacts] = useState<ShareContact[]>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [shareSearchResults, setShareSearchResults] = useState<{ user_id: string; name: string }[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);

  // Edit state
  const [editReel, setEditReel] = useState<Reel | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCourseId, setEditCourseId] = useState<string>("none");
  const [savingEdit, setSavingEdit] = useState(false);

  const openEditDialog = (reel: Reel) => {
    setEditReel(reel);
    setEditTitle(reel.title);
    setEditDesc(reel.description || "");
    setEditCourseId(reel.course_id || "none");
  };

  const saveEdit = async () => {
    if (!editReel || !user) return;
    if (!editTitle.trim()) { toast.error("Title is required"); return; }
    setSavingEdit(true);
    try {
      const newCourseId = editCourseId && editCourseId !== "none" ? editCourseId : null;
      const { error } = await supabase
        .from("reels")
        .update({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
          course_id: newCourseId,
        })
        .eq("id", editReel.id);
      if (error) throw error;
      setReels(prev => prev.map(r => r.id === editReel.id ? { ...r, title: editTitle.trim(), description: editDesc.trim() || null, course_id: newCourseId } : r));
      toast.success("Reel updated");
      setEditReel(null);
    } catch {
      toast.error("Failed to update reel");
    } finally {
      setSavingEdit(false);
    }
  };

  // Load teacher courses for upload
  useEffect(() => {
    if (role === "teacher" && user) {
      supabase.from("courses").select("id, title").eq("teacher_id", user.id).then(({ data }) => {
        setTeacherCourses(data || []);
      });
    }
  }, [role, user]);

  const loadReels = useCallback(async () => {
    if (!user) return;

    // Fetch all reels, user's course IDs, viewed reel IDs, and likes in parallel
    const [reelsRes, enrollRes, teacherRes, viewedRes, likesRes] = await Promise.all([
      supabase.from("reels").select("*").order("created_at", { ascending: false }),
      role === "student"
        ? supabase.from("enrollments").select("course_id").eq("student_id", user.id)
        : Promise.resolve({ data: [] as { course_id: string }[] }),
      role === "teacher"
        ? supabase.from("courses").select("id").eq("teacher_id", user.id)
        : Promise.resolve({ data: [] as { id: string }[] }),
      supabase.from("reel_views").select("reel_id").eq("user_id", user.id),
      supabase.from("reel_likes").select("reel_id").eq("user_id", user.id),
    ]);

    const allReels = reelsRes.data || [];
    if (!allReels.length) { setReels([]); return; }

    const myCourseIds = new Set([
      ...(enrollRes.data || []).map((e: any) => e.course_id),
      ...(teacherRes.data || []).map((c: any) => c.id),
    ]);
    const viewedIds = new Set((viewedRes.data || []).map((v: any) => v.reel_id));
    const myLikeIds = new Set((likesRes.data || []).map((l: any) => l.reel_id));

    // Fetch uploader profiles
    const uploaderIds = [...new Set(allReels.map((r: any) => r.uploaded_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", uploaderIds);
    const profileMap = Object.fromEntries(profiles?.map((p: any) => [p.user_id, p.name]) || []);

    // Build enriched reels with relevance score
    const enriched: (Reel & { score: number; viewed: boolean })[] = allReels.map((r: any) => {
      const isFromMyCourse = r.course_id && myCourseIds.has(r.course_id);
      const viewed = viewedIds.has(r.id);
      // Score: course-relevant first, then recency
      const recency = new Date(r.created_at).getTime();
      const score = (isFromMyCourse ? 1e15 : 0) + recency;
      return {
        ...r,
        uploader_name: profileMap[r.uploaded_by] || "User",
        liked_by_me: myLikeIds.has(r.id),
        score,
        viewed,
      };
    });

    // Filter and sort
    const filtered = showViewed ? enriched : enriched.filter(r => !r.viewed);
    filtered.sort((a, b) => b.score - a.score);

    setReels(filtered);
  }, [user, role, showViewed]);

  useEffect(() => { loadReels(); }, [loadReels]);

  // Auto-scroll to shared reel when loaded via ?id= param
  useEffect(() => {
    const targetId = searchParams.get("id");
    if (!targetId || reels.length === 0) return;
    const targetIndex = reels.findIndex(r => r.id === targetId);
    if (targetIndex < 0) return;
    const container = containerRef.current;
    if (!container) return;
    const targetEl = container.querySelector(`[data-index="${targetIndex}"]`);
    if (targetEl) {
      setTimeout(() => targetEl.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [reels, searchParams]);

  // Intersection observer for snap scrolling + view tracking
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reels.length === 0) return;

    const viewedSet = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.getAttribute("data-index"));
          if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
            setActiveIndex(index);

            // Track view
            const reel = reels[index];
            if (reel && user && !viewedSet.has(reel.id)) {
              viewedSet.add(reel.id);
              supabase.from("reel_views").upsert(
                { reel_id: reel.id, user_id: user.id },
                { onConflict: "reel_id,user_id" }
              ).then(() => {});
            }

            Object.entries(videoRefs.current).forEach(([key, video]) => {
              if (!video) return;
              if (Number(key) === index) {
                video.play().catch(() => {});
                setPlayingStates(prev => ({ ...prev, [index]: true }));
              } else {
                video.pause();
                video.currentTime = 0;
                setPlayingStates(prev => ({ ...prev, [Number(key)]: false }));
              }
            });
          }
        });
      },
      { root: container, threshold: 0.7 }
    );

    const items = container.querySelectorAll("[data-index]");
    items.forEach((item) => observer.observe(item));

    return () => observer.disconnect();
  }, [reels, user]);

  const togglePlay = (index: number) => {
    const video = videoRefs.current[index];
    if (!video) return;
    if (video.paused) {
      video.play().catch(() => {});
      setPlayingStates(prev => ({ ...prev, [index]: true }));
    } else {
      video.pause();
      setPlayingStates(prev => ({ ...prev, [index]: false }));
    }
  };

  const toggleLike = async (reel: Reel) => {
    if (!user) return;
    if (reel.liked_by_me) {
      await supabase.from("reel_likes").delete().eq("reel_id", reel.id).eq("user_id", user.id);
      setReels(prev => prev.map(r => r.id === reel.id ? { ...r, liked_by_me: false, likes_count: r.likes_count - 1 } : r));
    } else {
      await supabase.from("reel_likes").insert({ reel_id: reel.id, user_id: user.id });
      setReels(prev => prev.map(r => r.id === reel.id ? { ...r, liked_by_me: true, likes_count: r.likes_count + 1 } : r));
    }
  };

  const deleteReel = async (reel: Reel) => {
    if (!user || reel.uploaded_by !== user.id) return;
    try {
      // Best-effort: remove storage file if it's an uploaded mp4
      if (reel.video_url.includes("/storage/v1/object/public/reels/")) {
        const path = reel.video_url.split("/storage/v1/object/public/reels/")[1];
        if (path) await supabase.storage.from("reels").remove([decodeURIComponent(path)]);
      }
      const { error } = await supabase.from("reels").delete().eq("id", reel.id);
      if (error) throw error;
      setReels(prev => prev.filter(r => r.id !== reel.id));
      toast.success("Reel deleted");
    } catch {
      toast.error("Failed to delete reel");
    }
  };

  const handleUpload = async () => {
    if (!user || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      let videoUrl: string;

      if (uploadMode === "youtube") {
        if (!uploadYoutubeUrl.trim() || !extractYouTubeId(uploadYoutubeUrl)) {
          toast.error("Please enter a valid YouTube Shorts URL");
          setUploading(false);
          return;
        }
        videoUrl = uploadYoutubeUrl.trim();
      } else if (uploadMode === "tiktok") {
        const tikId = extractTikTokId(uploadYoutubeUrl);
        if (!uploadYoutubeUrl.trim() || !tikId) {
          toast.error("Please enter a valid TikTok video URL");
          setUploading(false);
          return;
        }
        if (!/\/video\/\d+/.test(uploadYoutubeUrl)) {
          toast.error("Please use the full TikTok URL (with /video/...). Open the short link in a browser and copy the address.");
          setUploading(false);
          return;
        }
        videoUrl = uploadYoutubeUrl.trim();
      } else {
        if (!uploadFile) { setUploading(false); return; }
        const filePath = `${user.id}/${Date.now()}-${uploadFile.name}`;
        const { error: uploadErr } = await supabase.storage.from("reels").upload(filePath, uploadFile);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("reels").getPublicUrl(filePath);
        videoUrl = urlData.publicUrl;
      }

      await supabase.from("reels").insert({
        uploaded_by: user.id,
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || null,
        video_url: videoUrl,
        course_id: (uploadCourseId && uploadCourseId !== "none") ? uploadCourseId : null,
      } as any);
      toast.success("Reel added!");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadDesc("");
      setUploadCourseId("");
      setUploadYoutubeUrl("");
      loadReels();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const generateReels = async () => {
    if (!generateCourseId) {
      toast.error("Please select a course");
      return;
    }
    setGenerating(true);
    setSuggestions([]);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-reel-content`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ courseId: generateCourseId }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Generation failed" }));
        toast.error(err.error || "Failed to generate reels");
        return;
      }
      const data = await resp.json();
      setSuggestions(data.suggestions || []);
      if (!data.suggestions?.length) toast.info("No suggestions generated");
    } catch {
      toast.error("Failed to generate reel suggestions");
    } finally {
      setGenerating(false);
    }
  };

  const publishSuggestion = async (index: number) => {
    if (!user) return;
    const s = suggestions[index];
    if (!s) return;
    setPublishingSuggestion(index);
    try {
      const generatedUrl = `generated://${encodeURIComponent(JSON.stringify({
        hook: s.hook,
        script: s.script,
        color_theme: s.color_theme,
      }))}`;

      await supabase.from("reels").insert({
        uploaded_by: user.id,
        title: s.title,
        description: s.script,
        video_url: generatedUrl,
        course_id: generateCourseId || null,
      } as any);

      toast.success(`"${s.title}" published!`);
      setSuggestions(prev => prev.filter((_, i) => i !== index));
      loadReels();
    } catch {
      toast.error("Failed to publish reel");
    } finally {
      setPublishingSuggestion(null);
    }
  };

  // Share functionality
  const openShareDialog = async (reel: Reel) => {
    setShareReel(reel);
    setShareOpen(true);
    setShareSearch("");
    setShareSearchResults([]);

    if (!user) return;

    // Load existing conversations as contacts
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations?.length) { setShareContacts([]); return; }

    const convoIds = participations.map(p => p.conversation_id);
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convoIds)
      .neq("user_id", user.id);

    if (!allParticipants?.length) { setShareContacts([]); return; }

    const otherUserIds = [...new Set(allParticipants.map(p => p.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, avatar_url")
      .in("user_id", otherUserIds);

    const profileMap = Object.fromEntries(profiles?.map(p => [p.user_id, p]) || []);

    const contacts: ShareContact[] = allParticipants.map(p => ({
      conversation_id: p.conversation_id,
      user_id: p.user_id,
      name: profileMap[p.user_id]?.name || "User",
      avatar_url: profileMap[p.user_id]?.avatar_url || undefined,
    }));

    // Group participants by conversation to show each conversation separately
    const convoMap = new Map<string, { names: string[]; avatars: (string | undefined)[] }>();
    for (const p of allParticipants) {
      const entry = convoMap.get(p.conversation_id) || { names: [], avatars: [] };
      entry.names.push(profileMap[p.user_id]?.name || "User");
      entry.avatars.push(profileMap[p.user_id]?.avatar_url || undefined);
      convoMap.set(p.conversation_id, entry);
    }

    const convos: ShareContact[] = Array.from(convoMap.entries()).map(([convoId, { names, avatars }]) => ({
      conversation_id: convoId,
      user_id: convoId, // use convo id as key
      name: names.join(", "),
      avatar_url: names.length === 1 ? avatars[0] : undefined,
      isGroup: names.length > 1,
    }));

    setShareContacts(convos);
  };

  const searchShareUsers = async (query: string) => {
    setShareSearch(query);
    if (query.length < 2) { setShareSearchResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, name")
      .ilike("name", `%${query}%`)
      .neq("user_id", user?.id || "")
      .limit(10);
    setShareSearchResults(data || []);
  };

  const shareToConversation = async (conversationId: string, recipientName: string) => {
    if (!user || !shareReel) return;
    setSharing(conversationId);
    try {
      const shareMessage = `🎬 Shared a reel: "${shareReel.title}"\n${window.location.origin}/reels?id=${shareReel.id}`;
      await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: shareMessage,
      });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      toast.success(`Sent to ${recipientName}`);
    } catch {
      toast.error("Failed to share");
    } finally {
      setSharing(null);
    }
  };

  const shareToNewUser = async (otherUserId: string, name: string) => {
    if (!user) return;
    setSharing(otherUserId);
    try {
      // Check for existing conversation
      const { data: myConvos } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", user.id);

      let convoId: string | null = null;

      if (myConvos) {
        for (const mc of myConvos) {
          const { data: otherPart } = await supabase
            .from("conversation_participants")
            .select("user_id")
            .eq("conversation_id", mc.conversation_id)
            .eq("user_id", otherUserId);
          if (otherPart?.length) {
            convoId = mc.conversation_id;
            break;
          }
        }
      }

      if (!convoId) {
        convoId = crypto.randomUUID();
        await supabase.from("conversations").insert({ id: convoId });
        await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: user.id });
        await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: otherUserId });
      }

      const shareMessage = `🎬 Shared a reel: "${shareReel!.title}"\n${window.location.origin}/reels?id=${shareReel!.id}`;
      await supabase.from("messages").insert({
        conversation_id: convoId,
        sender_id: user.id,
        content: shareMessage,
      });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convoId);
      toast.success(`Sent to ${name}`);
    } catch {
      toast.error("Failed to share");
    } finally {
      setSharing(null);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Film className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Reels</h1>
            <p className="text-xs text-muted-foreground">Microlearning videos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showViewed ? "secondary" : "outline"}
            size="sm"
            className="gap-1.5 rounded-xl text-xs"
            onClick={() => setShowViewed(!showViewed)}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {showViewed ? "Hide Watched" : "Show Watched"}
          </Button>
          {role === "teacher" && (
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20">
                  <Plus className="h-4 w-4" /> Upload
                </Button>
              </DialogTrigger>
               <DialogContent className="rounded-2xl max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Add a Reel</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "youtube" | "tiktok" | "generate")}>
                    <TabsList className="w-full rounded-xl">
                      <TabsTrigger value="youtube" className="flex-1 gap-1.5 rounded-lg text-xs">
                        <Link className="h-3.5 w-3.5" /> YouTube
                      </TabsTrigger>
                      <TabsTrigger value="tiktok" className="flex-1 gap-1.5 rounded-lg text-xs">
                        <Film className="h-3.5 w-3.5" /> TikTok
                      </TabsTrigger>
                      <TabsTrigger value="file" className="flex-1 gap-1.5 rounded-lg text-xs">
                        <Film className="h-3.5 w-3.5" /> Upload
                      </TabsTrigger>
                      <TabsTrigger value="generate" className="flex-1 gap-1.5 rounded-lg text-xs">
                        <Sparkles className="h-3.5 w-3.5" /> AI Generate
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>

                  {uploadMode === "generate" ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Select Course</label>
                        <Select value={generateCourseId} onValueChange={setGenerateCourseId}>
                          <SelectTrigger className="rounded-xl">
                            <SelectValue placeholder="Choose a course..." />
                          </SelectTrigger>
                          <SelectContent>
                            {teacherCourses.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        onClick={generateReels}
                        disabled={generating || !generateCourseId}
                        className="w-full rounded-xl gap-2"
                      >
                        {generating ? (
                          <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing syllabus...</>
                        ) : (
                          <><Sparkles className="h-4 w-4" /> Generate Reel Ideas</>
                        )}
                      </Button>

                      {suggestions.length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs text-muted-foreground font-medium">
                            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""} — approve to publish
                          </p>
                          {suggestions.map((s, i) => {
                            const colors = GENERATED_COLORS[s.color_theme] || GENERATED_COLORS.blue;
                            return (
                              <div key={i} className="rounded-xl border border-border overflow-hidden">
                                <div className={`bg-gradient-to-br ${colors.bg} p-3`}>
                                  <p className="text-white/60 text-[10px] font-medium uppercase tracking-wider">{s.topic}</p>
                                  <p className="text-white text-xs font-bold mt-0.5 italic">"{s.hook}"</p>
                                </div>
                                <div className="p-3 space-y-2">
                                  <p className="text-sm font-semibold">{s.title}</p>
                                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-4">{s.script}</p>
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      className="flex-1 rounded-lg gap-1.5 h-8 text-xs"
                                      onClick={() => publishSuggestion(i)}
                                      disabled={publishingSuggestion === i}
                                    >
                                      {publishingSuggestion === i ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Check className="h-3 w-3" />
                                      )}
                                      Approve & Post
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="rounded-lg h-8 text-xs text-muted-foreground"
                                      onClick={() => setSuggestions(prev => prev.filter((_, j) => j !== i))}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <Input placeholder="Title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="rounded-xl" />
                      <Textarea placeholder="Description (optional)" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} className="rounded-xl" />
                      {uploadMode === "youtube" ? (
                        <div>
                          <label className="block text-sm font-medium mb-1">YouTube Shorts URL</label>
                          <Input
                            placeholder="https://youtube.com/shorts/..."
                            value={uploadYoutubeUrl}
                            onChange={e => setUploadYoutubeUrl(e.target.value)}
                            className="rounded-xl"
                          />
                          {uploadYoutubeUrl && extractYouTubeId(uploadYoutubeUrl) && (
                            <div className="mt-2 rounded-xl overflow-hidden aspect-[9/16] max-h-[200px] bg-black">
                              <iframe
                                src={`https://www.youtube.com/embed/${extractYouTubeId(uploadYoutubeUrl)}?autoplay=0`}
                                className="w-full h-full"
                                allow="accelerometer; clipboard-write; encrypted-media; gyroscope"
                                allowFullScreen
                              />
                            </div>
                          )}
                        </div>
                      ) : uploadMode === "tiktok" ? (
                        <div>
                          <label className="block text-sm font-medium mb-1">TikTok Video URL</label>
                          <Input
                            placeholder="https://www.tiktok.com/@user/video/123..."
                            value={uploadYoutubeUrl}
                            onChange={e => setUploadYoutubeUrl(e.target.value)}
                            className="rounded-xl"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Paste a public TikTok video link. Short links (vm.tiktok.com) work too.
                          </p>
                          {uploadYoutubeUrl && extractTikTokId(uploadYoutubeUrl) && /\/video\/\d+/.test(uploadYoutubeUrl) && (
                            <div className="mt-2 rounded-xl overflow-hidden aspect-[9/16] max-h-[260px] bg-black">
                              <iframe
                                src={`https://www.tiktok.com/embed/v2/${extractTikTokId(uploadYoutubeUrl)}`}
                                className="w-full h-full"
                                allow="encrypted-media;"
                                allowFullScreen
                              />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium mb-1">Video File</label>
                          <Input type="file" accept="video/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="rounded-xl" />
                        </div>
                      )}
                      {teacherCourses.length > 0 && (
                        <div>
                          <label className="block text-sm font-medium mb-1">Course (optional)</label>
                          <Select value={uploadCourseId} onValueChange={setUploadCourseId}>
                            <SelectTrigger className="rounded-xl">
                              <SelectValue placeholder="General (no course)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">General (no course)</SelectItem>
                              {teacherCourses.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button
                        onClick={handleUpload}
                        disabled={
                          uploading ||
                          !uploadTitle.trim() ||
                          (uploadMode === "file"
                            ? !uploadFile
                            : uploadMode === "tiktok"
                              ? !extractTikTokId(uploadYoutubeUrl)
                              : !extractYouTubeId(uploadYoutubeUrl))
                        }
                        className="w-full rounded-xl"
                      >
                        {uploading ? "Adding..." : uploadMode === "file" ? "Upload Reel" : "Add Reel"}
                      </Button>
                    </>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl scale-150" />
            <Film className="relative h-20 w-20 mb-4 opacity-20" />
          </div>
          <p className="text-lg font-semibold mt-2">{showViewed ? "No reels yet" : "You're all caught up! 🎉"}</p>
          <p className="text-sm text-muted-foreground/60">
            {!showViewed
              ? "You've watched all available reels"
              : role === "teacher" ? "Upload your first microlearning reel" : "Check back soon for new content"}
          </p>
          {!showViewed && (
            <Button variant="outline" className="mt-4 rounded-xl gap-1.5" onClick={() => setShowViewed(true)}>
              <RotateCcw className="h-3.5 w-3.5" /> Rewatch Reels
            </Button>
          )}
        </div>
      ) : (
        <div className="flex justify-center">
          <div
            ref={containerRef}
            className="relative w-full max-w-[380px] h-[calc(100vh-180px)] overflow-y-scroll snap-y snap-mandatory rounded-2xl scrollbar-hide"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            {reels.map((reel, index) => (
              <div
                key={reel.id}
                data-index={index}
                className="relative w-full h-full snap-start snap-always flex-shrink-0"
              >
                {/* Video / Generated Content */}
                <div className="absolute inset-0 rounded-2xl overflow-hidden">
                  {isGeneratedReel(reel.video_url) ? (() => {
                    const content = parseGeneratedContent(reel.video_url);
                    return (
                      <GeneratedReelCard
                        title={reel.title}
                        hook={content?.hook || ""}
                        script={content?.script || reel.description || ""}
                        colorTheme={content?.color_theme || "blue"}
                        isActive={index === activeIndex}
                      />
                    );
                  })() : isYouTubeUrl(reel.video_url) ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${extractYouTubeId(reel.video_url)}?autoplay=${index === activeIndex ? 1 : 0}&mute=${muted ? 1 : 0}&loop=1&playlist=${extractYouTubeId(reel.video_url)}&controls=0&modestbranding=1&rel=0&playsinline=1`}
                      className="w-full h-full bg-black"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : isTikTokUrl(reel.video_url) ? (
                    <iframe
                      key={`tiktok-${reel.id}-${index === activeIndex ? "active" : "idle"}`}
                      src={`https://www.tiktok.com/embed/v2/${extractTikTokId(reel.video_url)}${index === activeIndex ? "?autoplay=1" : ""}`}
                      className="w-full h-full bg-black"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="bg-black w-full h-full">
                      <video
                        ref={(el) => { videoRefs.current[index] = el; }}
                        src={reel.video_url}
                        className="w-full h-full object-cover cursor-pointer"
                        loop
                        playsInline
                        muted={muted}
                        onClick={() => togglePlay(index)}
                      />

                      {/* Paused overlay */}
                      {!playingStates[index] && (
                        <div
                          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity duration-300"
                          onClick={() => togglePlay(index)}
                        >
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md">
                            <Play className="h-8 w-8 text-white ml-1" fill="white" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isGeneratedReel(reel.video_url) && (
                  <>
                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
                    <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                  </>
                )}

                  {/* Top bar */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                    <span className="text-white/60 text-xs font-medium bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
                      {index + 1} / {reels.length}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm text-white/80 hover:bg-white/20 transition-colors"
                    >
                      {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Right action bar */}
                  <div className="absolute right-3 bottom-32 flex flex-col items-center gap-6 z-10">
                    {/* Like */}
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleLike(reel); }}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className={`flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 ${
                        reel.liked_by_me
                          ? "bg-red-500/20 scale-110"
                          : "bg-white/10 backdrop-blur-sm group-hover:bg-white/20"
                      }`}>
                        <Heart className={`h-6 w-6 transition-all duration-300 ${
                          reel.liked_by_me ? "text-red-500 fill-red-500 scale-110" : "text-white"
                        }`} />
                      </div>
                      <span className={`text-xs font-semibold ${reel.liked_by_me ? "text-red-400" : "text-white/80"}`}>
                        {reel.likes_count}
                      </span>
                    </button>

                    {/* Share */}
                    <button
                      onClick={(e) => { e.stopPropagation(); openShareDialog(reel); }}
                      className="flex flex-col items-center gap-1 group"
                    >
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm group-hover:bg-white/20 transition-all duration-300">
                        <Send className="h-5 w-5 text-white" />
                      </div>
                      <span className="text-xs font-semibold text-white/80">Share</span>
                    </button>

                    {/* Delete (own reels only) */}
                    {user && reel.uploaded_by === user.id && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            onClick={(e) => e.stopPropagation()}
                            className="flex flex-col items-center gap-1 group"
                          >
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur-sm group-hover:bg-destructive/40 transition-all duration-300">
                              <Trash2 className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xs font-semibold text-white/80">Delete</span>
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete this reel?</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{reel.title}" will be permanently removed. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deleteReel(reel)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>

                  {/* Bottom info */}
                  <div className="absolute bottom-0 left-0 right-14 p-5 z-10">
                    <div className="flex items-center gap-2.5 mb-3">
                      <Avatar className="h-9 w-9 ring-2 ring-white/30">
                        <AvatarFallback className="text-xs bg-white/20 text-white font-bold">
                          {reel.uploader_name?.charAt(0)?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <span className="text-white text-sm font-semibold block leading-tight">
                          {reel.uploader_name}
                        </span>
                        <span className="text-white/40 text-[10px]">
                          {new Date(reel.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-white text-sm font-bold leading-snug">{reel.title}</p>
                    {reel.description && (
                      <p className="text-white/60 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                        {reel.description}
                      </p>
                    )}
                  </div>

                  {/* Progress dots */}
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
                    {reels.length <= 10 && reels.map((_, i) => (
                      <div
                        key={i}
                        className={`h-1 rounded-full transition-all duration-300 ${
                          i === activeIndex ? "w-5 bg-white" : "w-1 bg-white/30"
                        }`}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Share Reel
            </DialogTitle>
          </DialogHeader>
          {shareReel && (
            <p className="text-xs text-muted-foreground truncate -mt-2">
              🎬 {shareReel.title}
            </p>
          )}

          {/* Search for new users */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={shareSearch}
              onChange={e => searchShareUsers(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>

          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1">
              {/* Search results (new users) */}
              {shareSearchResults.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium px-1 pt-1">Search Results</p>
                  {shareSearchResults
                    .filter(u => !shareContacts.some(c => c.user_id === u.user_id))
                    .map(u => (
                      <div
                        key={u.user_id}
                        className="flex items-center justify-between rounded-xl p-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                              {u.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{u.name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl h-8 text-xs"
                          disabled={sharing === u.user_id}
                          onClick={() => shareToNewUser(u.user_id, u.name)}
                        >
                          {sharing === u.user_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                        </Button>
                      </div>
                    ))}
                </>
              )}

              {/* Existing conversations */}
              {shareContacts.length > 0 && (
                <>
                  <p className="text-xs text-muted-foreground font-medium px-1 pt-2">Recent Chats</p>
                  {shareContacts.map(c => (
                    <div
                      key={c.conversation_id}
                      className="flex items-center justify-between rounded-xl p-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                            {c.isGroup ? <Users className="h-3.5 w-3.5" /> : c.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <span className="text-sm font-medium block truncate max-w-[180px]">{c.name}</span>
                          {c.isGroup && <span className="text-[10px] text-muted-foreground">Group</span>}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl h-8 text-xs"
                        disabled={sharing === c.conversation_id}
                        onClick={() => shareToConversation(c.conversation_id, c.name)}
                      >
                        {sharing === c.conversation_id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Send"}
                      </Button>
                    </div>
                  ))}
                </>
              )}

              {shareContacts.length === 0 && shareSearchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  Search for a user to share this reel with
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
