import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Heart, MessageCircle, Send, Plus, Image as ImageIcon,
  Loader2, X, MoreHorizontal, Trash2, Compass,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Post {
  id: string;
  author_id: string;
  content: string;
  image_url: string | null;
  likes_count: number;
  comments_count: number;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
  author_major?: string;
  liked_by_me?: boolean;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  author_avatar?: string;
}

export default function Explore() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  // Create post state
  const [createOpen, setCreateOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postImage, setPostImage] = useState<File | null>(null);
  const [postImagePreview, setPostImagePreview] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Comments state
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsPostId, setCommentsPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  // Share state
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePost, setSharePost] = useState<Post | null>(null);
  const [shareContacts, setShareContacts] = useState<{ conversation_id: string; name: string; isGroup: boolean }[]>([]);
  const [sharing, setSharing] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!data) { setLoading(false); return; }

    const authorIds = [...new Set(data.map((p: any) => p.author_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, avatar_url, major")
      .in("user_id", authorIds);

    const profileMap = Object.fromEntries(
      profiles?.map((p: any) => [p.user_id, p]) || []
    );

    let myLikes: string[] = [];
    if (user) {
      const { data: likes } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("user_id", user.id);
      myLikes = likes?.map((l: any) => l.post_id) || [];
    }

    setPosts(data.map((p: any) => ({
      ...p,
      author_name: profileMap[p.author_id]?.name || "User",
      author_avatar: profileMap[p.author_id]?.avatar_url || null,
      author_major: profileMap[p.author_id]?.major || null,
      liked_by_me: myLikes.includes(p.id),
    })));
    setLoading(false);
  }, [user]);

  useEffect(() => { loadPosts(); }, [loadPosts]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPostImage(file);
    const reader = new FileReader();
    reader.onload = () => setPostImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const createPost = async () => {
    if (!user || !postContent.trim()) return;
    setCreating(true);
    try {
      let imageUrl: string | null = null;

      if (postImage) {
        const filePath = `${user.id}/${Date.now()}-${postImage.name}`;
        const { error: uploadErr } = await supabase.storage.from("post-images").upload(filePath, postImage);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("post-images").getPublicUrl(filePath);
        imageUrl = urlData.publicUrl;
      }

      await supabase.from("posts").insert({
        author_id: user.id,
        content: postContent.trim(),
        image_url: imageUrl,
      });

      toast.success("Post published!");
      setCreateOpen(false);
      setPostContent("");
      setPostImage(null);
      setPostImagePreview(null);
      loadPosts();
    } catch {
      toast.error("Failed to create post");
    } finally {
      setCreating(false);
    }
  };

  const toggleLike = async (post: Post) => {
    if (!user) return;
    if (post.liked_by_me) {
      await supabase.from("post_likes").delete().eq("post_id", post.id).eq("user_id", user.id);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, liked_by_me: false, likes_count: p.likes_count - 1 } : p));
    } else {
      await supabase.from("post_likes").insert({ post_id: post.id, user_id: user.id });
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, liked_by_me: true, likes_count: p.likes_count + 1 } : p));
    }
  };

  const deletePost = async (postId: string) => {
    if (!confirm("Delete this post?")) return;
    await supabase.from("posts").delete().eq("id", postId);
    setPosts(prev => prev.filter(p => p.id !== postId));
    toast.success("Post deleted");
  };

  // Comments
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
        const { data: profile } = await supabase
          .from("profiles")
          .select("name, avatar_url")
          .eq("user_id", user.id)
          .single();

        setComments(prev => [...prev, {
          ...data,
          author_name: profile?.name || "You",
          author_avatar: profile?.avatar_url || null,
        }]);
        setPosts(prev => prev.map(p => p.id === commentsPostId ? { ...p, comments_count: p.comments_count + 1 } : p));
      }
      setNewComment("");
    } catch {
      toast.error("Failed to post comment");
    } finally {
      setSendingComment(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    await supabase.from("post_comments").delete().eq("id", commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    if (commentsPostId) {
      setPosts(prev => prev.map(p => p.id === commentsPostId ? { ...p, comments_count: Math.max(0, p.comments_count - 1) } : p));
    }
  };

  // Share
  const openShare = async (post: Post) => {
    setSharePost(post);
    setShareOpen(true);
    if (!user) return;

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
      .select("user_id, name")
      .in("user_id", otherUserIds);

    const profileMap = Object.fromEntries(profiles?.map(p => [p.user_id, p.name]) || []);

    const seen = new Set<string>();
    const contacts = allParticipants
      .map(p => ({ conversation_id: p.conversation_id, user_id: p.user_id, name: profileMap[p.user_id] || "User" }))
      .filter(c => { if (seen.has(c.user_id)) return false; seen.add(c.user_id); return true; });

    setShareContacts(contacts);
  };

  const shareToConversation = async (conversationId: string, recipientName: string) => {
    if (!user || !sharePost) return;
    setSharing(conversationId);
    try {
      const msg = `📝 Shared a post by ${sharePost.author_name}:\n"${sharePost.content.slice(0, 100)}${sharePost.content.length > 100 ? "..." : ""}"`;
      await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: user.id, content: msg });
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
      toast.success(`Sent to ${recipientName}`);
    } catch {
      toast.error("Failed to share");
    } finally {
      setSharing(null);
    }
  };

  return (
    <DashboardLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <Compass className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Explore</h1>
            <p className="text-xs text-muted-foreground">See what everyone's working on</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 rounded-xl shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" /> New Post
        </Button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Compass className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg font-semibold">No posts yet</p>
          <p className="text-sm">Be the first to share something!</p>
        </div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {posts.map(post => (
            <Card key={post.id} className="overflow-hidden transition-all hover:shadow-md">
              <CardContent className="p-0">
                {/* Author header */}
                <div className="flex items-center justify-between p-4 pb-2">
                  <button
                    onClick={() => navigate(`/students/${post.author_id}/profile`)}
                    className="flex items-center gap-3 group"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={post.author_avatar || undefined} />
                      <AvatarFallback className="bg-primary/10 text-primary text-sm font-bold">
                        {post.author_name?.charAt(0)?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                      <p className="text-sm font-semibold group-hover:text-primary transition-colors">{post.author_name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {post.author_major && `${post.author_major} · `}
                        {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </button>
                  {post.author_id === user?.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => deletePost(post.id)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>

                {/* Content */}
                <div className="px-4 pb-3">
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.content}</p>
                </div>

                {/* Image */}
                {post.image_url && (
                  <div className="px-4 pb-3">
                    <img
                      src={post.image_url}
                      alt="Post image"
                      className="w-full rounded-xl object-cover max-h-[400px]"
                    />
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-1 px-2 pb-2 border-t border-border/50 pt-2 mx-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`gap-1.5 rounded-xl text-xs ${post.liked_by_me ? "text-red-500 hover:text-red-600" : ""}`}
                    onClick={() => toggleLike(post)}
                  >
                    <Heart className={`h-4 w-4 ${post.liked_by_me ? "fill-red-500" : ""}`} />
                    {post.likes_count > 0 && post.likes_count}
                    {post.likes_count === 0 ? "Like" : ""}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-xs"
                    onClick={() => openComments(post.id)}
                  >
                    <MessageCircle className="h-4 w-4" />
                    {post.comments_count > 0 && post.comments_count}
                    {post.comments_count === 0 ? "Comment" : ""}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 rounded-xl text-xs"
                    onClick={() => openShare(post)}
                  >
                    <Send className="h-4 w-4" />
                    Share
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Post Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create a Post</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="What are you working on? Share a project, idea, or update..."
              value={postContent}
              onChange={e => setPostContent(e.target.value)}
              className="min-h-[120px] rounded-xl resize-none"
            />
            {postImagePreview && (
              <div className="relative">
                <img src={postImagePreview} alt="Preview" className="w-full rounded-xl max-h-60 object-cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full"
                  onClick={() => { setPostImage(null); setPostImagePreview(null); }}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            <div className="flex items-center justify-between">
              <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
              <Button variant="outline" size="sm" className="gap-2 rounded-xl" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon className="h-4 w-4" /> Add Image
              </Button>
              <Button onClick={createPost} disabled={creating || !postContent.trim()} className="rounded-xl gap-2">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Post
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              <p className="text-sm text-muted-foreground text-center py-8">No comments yet. Be the first!</p>
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
                          <button
                            onClick={() => deleteComment(c.id)}
                            className="text-[10px] text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                          >
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

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Share Post
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-1">
              {shareContacts.length > 0 ? (
                shareContacts.map(c => (
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
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No conversations yet. Start a chat first to share posts!
                </p>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
