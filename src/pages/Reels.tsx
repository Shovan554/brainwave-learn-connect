import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Heart, Play, Plus, Film, Volume2, VolumeX } from "lucide-react";
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

export default function Reels() {
  const { user, role } = useAuth();
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
            // Play this video, pause others
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
    </DashboardLayout>
  );
}
