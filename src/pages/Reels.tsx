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
import { Heart, Play, Plus, Film, Volume2, VolumeX, Send, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [uploading, setUploading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [playingStates, setPlayingStates] = useState<Record<number, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  // Share state
  const [shareOpen, setShareOpen] = useState(false);
  const [shareReel, setShareReel] = useState<Reel | null>(null);
  const [shareContacts, setShareContacts] = useState<ShareContact[]>([]);
  const [shareSearch, setShareSearch] = useState("");
  const [shareSearchResults, setShareSearchResults] = useState<{ user_id: string; name: string }[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);

  const loadReels = useCallback(async () => {
    const { data } = await supabase
      .from("reels")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return;

    const uploaderIds = [...new Set(data.map((r: any) => r.uploaded_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", uploaderIds);

    const profileMap = Object.fromEntries(profiles?.map((p: any) => [p.user_id, p.name]) || []);

    let myLikes: string[] = [];
    if (user) {
      const { data: likes } = await supabase
        .from("reel_likes")
        .select("reel_id")
        .eq("user_id", user.id);
      myLikes = likes?.map((l: any) => l.reel_id) || [];
    }

    setReels(data.map((r: any) => ({
      ...r,
      uploader_name: profileMap[r.uploaded_by] || "User",
      liked_by_me: myLikes.includes(r.id),
    })));
  }, [user]);

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

  // Intersection observer for snap scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || reels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number(entry.target.getAttribute("data-index"));
          if (entry.isIntersecting && entry.intersectionRatio > 0.7) {
            setActiveIndex(index);
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
  }, [reels]);

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

  const handleUpload = async () => {
    if (!user || !uploadFile || !uploadTitle.trim()) return;
    setUploading(true);
    try {
      const filePath = `${user.id}/${Date.now()}-${uploadFile.name}`;
      const { error: uploadErr } = await supabase.storage.from("reels").upload(filePath, uploadFile);
      if (uploadErr) throw uploadErr;
      const { data: urlData } = supabase.storage.from("reels").getPublicUrl(filePath);
      await supabase.from("reels").insert({
        uploaded_by: user.id,
        title: uploadTitle.trim(),
        description: uploadDesc.trim() || null,
        video_url: urlData.publicUrl,
      });
      toast.success("Reel uploaded!");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setUploadDesc("");
      loadReels();
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
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
        {role === "teacher" && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 rounded-xl shadow-lg shadow-primary/20">
                <Plus className="h-4 w-4" /> Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-2xl">
              <DialogHeader><DialogTitle>Upload a Reel</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} className="rounded-xl" />
                <Textarea placeholder="Description (optional)" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} className="rounded-xl" />
                <div>
                  <label className="block text-sm font-medium mb-1">Video File</label>
                  <Input type="file" accept="video/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} className="rounded-xl" />
                </div>
                <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()} className="w-full rounded-xl">
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/5 blur-3xl scale-150" />
            <Film className="relative h-20 w-20 mb-4 opacity-20" />
          </div>
          <p className="text-lg font-semibold mt-2">No reels yet</p>
          <p className="text-sm text-muted-foreground/60">
            {role === "teacher" ? "Upload your first microlearning reel" : "Check back soon for new content"}
          </p>
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
                {/* Video */}
                <div className="absolute inset-0 bg-black rounded-2xl overflow-hidden">
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

                  {/* Gradient overlays */}
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />
                  <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

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
                            {c.name.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{c.name}</span>
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
