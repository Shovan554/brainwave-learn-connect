import { useState, useEffect, useRef, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Heart, Upload, ChevronUp, ChevronDown, Play, Pause, Plus } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

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
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploading, setUploading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const loadReels = useCallback(async () => {
    const { data } = await supabase
      .from("reels")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return;

    // Get uploader profiles
    const uploaderIds = [...new Set(data.map((r: any) => r.uploaded_by))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", uploaderIds);

    const profileMap = Object.fromEntries(profiles?.map((p: any) => [p.user_id, p.name]) || []);

    // Get my likes
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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load();
      if (playing) videoRef.current.play().catch(() => {});
    }
  }, [currentIndex]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); } else { videoRef.current.play(); }
    setPlaying(!playing);
  };

  const goNext = () => {
    if (currentIndex < reels.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setPlaying(true);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setPlaying(true);
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

  const currentReel = reels[currentIndex];

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Reels</h1>
        {role === "teacher" && (
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Upload Reel</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Upload a Reel</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <Input placeholder="Title" value={uploadTitle} onChange={e => setUploadTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} />
                <div>
                  <label className="block text-sm font-medium mb-1">Video File</label>
                  <Input type="file" accept="video/*" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </div>
                <Button onClick={handleUpload} disabled={uploading || !uploadFile || !uploadTitle.trim()} className="w-full">
                  {uploading ? "Uploading..." : "Upload"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {reels.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[60vh] text-muted-foreground">
          <Upload className="h-16 w-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">No reels yet</p>
          <p className="text-sm">Be the first to upload a reel!</p>
        </div>
      ) : (
        <div className="flex justify-center">
          <div className="relative w-full max-w-sm aspect-[9/16] bg-black rounded-2xl overflow-hidden shadow-2xl">
            {currentReel && (
              <>
                <video
                  ref={videoRef}
                  src={currentReel.video_url}
                  className="w-full h-full object-cover cursor-pointer"
                  loop
                  playsInline
                  onClick={togglePlay}
                />

                {!playing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                    <Play className="h-16 w-16 text-white/80" fill="white" />
                  </div>
                )}

                {/* Info overlay */}
                <div className="absolute bottom-0 left-0 right-12 p-4 bg-gradient-to-t from-black/80 to-transparent">
                  <div className="flex items-center gap-2 mb-2">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px] bg-white/20 text-white">{currentReel.uploader_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-white text-sm font-medium">{currentReel.uploader_name}</span>
                  </div>
                  <p className="text-white text-sm font-semibold">{currentReel.title}</p>
                  {currentReel.description && <p className="text-white/70 text-xs mt-1 line-clamp-2">{currentReel.description}</p>}
                </div>

                {/* Action buttons */}
                <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
                  <button onClick={() => toggleLike(currentReel)} className="flex flex-col items-center gap-1">
                    <Heart className={`h-7 w-7 ${currentReel.liked_by_me ? "text-red-500 fill-red-500" : "text-white"}`} />
                    <span className="text-white text-xs">{currentReel.likes_count}</span>
                  </button>
                </div>

                {/* Navigation */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                  <Button size="icon" variant="ghost" disabled={currentIndex === 0} onClick={goPrev} className="bg-black/30 text-white hover:bg-black/50 h-8 w-8">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={currentIndex >= reels.length - 1} onClick={goNext} className="bg-black/30 text-white hover:bg-black/50 h-8 w-8">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </div>

                {/* Counter */}
                <div className="absolute top-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                  {currentIndex + 1} / {reels.length}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
