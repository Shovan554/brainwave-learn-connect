import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Send, Paperclip, Plus, Search, Image, FileText, X, Trash2, Film, Play, Users, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";

interface Conversation {
  id: string;
  updated_at: string;
  participants: { user_id: string; name: string; avatar_url?: string }[];
  lastMessage?: string;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  attachments?: { id: string; file_url: string; file_name: string; file_type: string }[];
}

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [searchUsers, setSearchUsers] = useState("");
  const [foundUsers, setFoundUsers] = useState<any[]>([]);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group chat state
  const [groupMembers, setGroupMembers] = useState<{ user_id: string; name: string }[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSearchResults, setGroupSearchResults] = useState<any[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    const { data: participations } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (!participations?.length) return;

    const convoIds = participations.map((p: any) => p.conversation_id);
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, updated_at")
      .in("id", convoIds)
      .order("updated_at", { ascending: false });

    if (!convos) return;

    // Get all participants for these convos
    const { data: allParticipants } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id")
      .in("conversation_id", convoIds);

    // Get profiles
    const userIds = [...new Set(allParticipants?.map((p: any) => p.user_id) || [])];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, avatar_url")
      .in("user_id", userIds);

    const profileMap = Object.fromEntries(profiles?.map((p: any) => [p.user_id, { name: p.name, avatar_url: p.avatar_url }]) || []);

    // Get last message for each conversation
    const convoList: Conversation[] = await Promise.all(
      convos.map(async (c: any) => {
        const parts = allParticipants
          ?.filter((p: any) => p.conversation_id === c.id && p.user_id !== user.id)
          .map((p: any) => ({ user_id: p.user_id, name: profileMap[p.user_id]?.name || "User", avatar_url: profileMap[p.user_id]?.avatar_url })) || [];

        const { data: lastMsg } = await supabase
          .from("messages")
          .select("content")
          .eq("conversation_id", c.id)
          .order("created_at", { ascending: false })
          .limit(1);

        return {
          id: c.id,
          updated_at: c.updated_at,
          participants: parts,
          lastMessage: lastMsg?.[0]?.content || "",
        };
      })
    );

    setConversations(convoList);
  }, [user]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConvo) return;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", selectedConvo)
        .order("created_at", { ascending: true });

      if (data) {
        // Load attachments for each message
        const msgIds = data.map((m: any) => m.id);
        const { data: atts } = await supabase
          .from("message_attachments")
          .select("*")
          .in("message_id", msgIds);

        const msgsWithAtts = data.map((m: any) => ({
          ...m,
          attachments: atts?.filter((a: any) => a.message_id === m.id) || [],
        }));
        setMessages(msgsWithAtts);
      }
    };

    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`messages-${selectedConvo}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${selectedConvo}`,
      }, async (payload) => {
        const newMsg = payload.new as any;
        const { data: atts } = await supabase
          .from("message_attachments")
          .select("*")
          .eq("message_id", newMsg.id);
        setMessages(prev => [...prev, { ...newMsg, attachments: atts || [] }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConvo]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const searchForUsers = async (query: string) => {
    setSearchUsers(query);
    if (query.length < 2) { setFoundUsers([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, name, major")
      .ilike("name", `%${query}%`)
      .neq("user_id", user?.id || "")
      .limit(10);
    setFoundUsers(data || []);
  };

  const startConversation = async (otherUserId: string) => {
    if (!user) return;

    // Check if conversation already exists
    const { data: myConvos } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("user_id", user.id);

    if (myConvos) {
      for (const mc of myConvos) {
        const { data: otherPart } = await supabase
          .from("conversation_participants")
          .select("user_id")
          .eq("conversation_id", mc.conversation_id)
          .eq("user_id", otherUserId);
        if (otherPart?.length) {
          setSelectedConvo(mc.conversation_id);
          setNewChatOpen(false);
          return;
        }
      }
    }

    // Create new conversation with client-generated ID
    const convoId = crypto.randomUUID();
    const { error } = await supabase
      .from("conversations")
      .insert({ id: convoId });

    if (error) { toast.error("Failed to create conversation"); return; }

    // Add self first (satisfies "user_id = auth.uid()" policy)
    const { error: selfErr } = await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: user.id });
    if (selfErr) { toast.error("Failed to create conversation"); return; }

    // Now add the other user (satisfies "is_conversation_participant" policy)
    const { error: otherErr } = await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: otherUserId });
    if (otherErr) { toast.error("Failed to add participant"); return; }

    setSelectedConvo(convoId);
    setNewChatOpen(false);
    loadConversations();
  };

  const searchGroupUsers = async (query: string) => {
    setGroupSearch(query);
    if (query.length < 2) { setGroupSearchResults([]); return; }
    const { data } = await supabase
      .from("profiles")
      .select("user_id, name, major")
      .ilike("name", `%${query}%`)
      .neq("user_id", user?.id || "")
      .limit(10);
    setGroupSearchResults(data || []);
  };

  const toggleGroupMember = (u: { user_id: string; name: string }) => {
    setGroupMembers(prev =>
      prev.some(m => m.user_id === u.user_id)
        ? prev.filter(m => m.user_id !== u.user_id)
        : [...prev, u]
    );
  };

  const createGroupChat = async () => {
    if (!user || groupMembers.length < 2) return;
    setCreatingGroup(true);
    try {
      const convoId = crypto.randomUUID();
      const { error } = await supabase.from("conversations").insert({ id: convoId });
      if (error) throw error;

      await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: user.id });

      for (const member of groupMembers) {
        await supabase.from("conversation_participants").insert({ conversation_id: convoId, user_id: member.user_id });
      }

      const names = groupMembers.map(m => m.name).join(", ");
      await supabase.from("messages").insert({
        conversation_id: convoId,
        sender_id: user.id,
        content: `👥 Group created with ${names}`,
      });

      setSelectedConvo(convoId);
      setNewChatOpen(false);
      setGroupMembers([]);
      setGroupSearch("");
      setGroupSearchResults([]);
      loadConversations();
      toast.success("Group created!");
    } catch {
      toast.error("Failed to create group");
    } finally {
      setCreatingGroup(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedConvo || (!newMessage.trim() && !attachments.length)) return;
    setSending(true);

    try {
      const { data: msg, error } = await supabase
        .from("messages")
        .insert({ conversation_id: selectedConvo, sender_id: user.id, content: newMessage.trim() })
        .select()
        .single();

      if (error || !msg) throw error;

      // Upload attachments
      for (const file of attachments) {
        const filePath = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("message-attachments")
          .upload(filePath, file);

        if (!uploadErr) {
          const { data: urlData } = supabase.storage
            .from("message-attachments")
            .getPublicUrl(filePath);

          await supabase.from("message_attachments").insert({
            message_id: msg.id,
            file_url: urlData.publicUrl,
            file_name: file.name,
            file_type: file.type.startsWith("image/") ? "image" : "file",
          });
        }
      }

      // Update conversation timestamp
      await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", selectedConvo);

      setNewMessage("");
      setAttachments([]);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const deleteConversation = async (convoId: string) => {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    // Delete attachments, messages, participants, then conversation
    const { data: msgs } = await supabase.from("messages").select("id").eq("conversation_id", convoId);
    if (msgs?.length) {
      const msgIds = msgs.map((m: any) => m.id);
      await supabase.from("message_attachments").delete().in("message_id", msgIds);
    }
    await supabase.from("messages").delete().eq("conversation_id", convoId);
    await supabase.from("conversation_participants").delete().eq("conversation_id", convoId);
    await supabase.from("conversations").delete().eq("id", convoId);

    if (selectedConvo === convoId) {
      setSelectedConvo(null);
      setMessages([]);
    }
    setConversations(prev => prev.filter(c => c.id !== convoId));
    toast.success("Conversation deleted");
  };

  const selectedConvoData = conversations.find(c => c.id === selectedConvo);
  const isGroup = (selectedConvoData?.participants?.length || 0) > 1;
  const otherName = isGroup
    ? selectedConvoData?.participants.map(p => p.name).join(", ") || "Group"
    : selectedConvoData?.participants?.[0]?.name || "Chat";
  const otherAvatar = !isGroup ? selectedConvoData?.participants?.[0]?.avatar_url : undefined;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-6rem)] rounded-xl border border-border bg-card overflow-hidden">
        {/* Conversations sidebar */}
        <div className="w-80 border-r border-border flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-lg">Messages</h2>
            <Dialog open={newChatOpen} onOpenChange={setNewChatOpen}>
              <DialogTrigger asChild>
                <Button size="icon" variant="ghost"><Plus className="h-5 w-5" /></Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader><DialogTitle>New Conversation</DialogTitle></DialogHeader>
                <Tabs defaultValue="dm" className="w-full">
                  <TabsList className="w-full mb-3">
                    <TabsTrigger value="dm" className="flex-1 gap-1.5"><Send className="h-3.5 w-3.5" /> Direct</TabsTrigger>
                    <TabsTrigger value="group" className="flex-1 gap-1.5"><Users className="h-3.5 w-3.5" /> Group</TabsTrigger>
                  </TabsList>

                  {/* Direct Message Tab */}
                  <TabsContent value="dm" className="space-y-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search users..." className="pl-9 rounded-xl" value={searchUsers} onChange={e => searchForUsers(e.target.value)} />
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                      {foundUsers.map(u => (
                        <button
                          key={u.user_id}
                          onClick={() => startConversation(u.user_id)}
                          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-accent text-left transition-colors"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs bg-primary/10 text-primary">{u.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{u.name}</p>
                            {u.major && <p className="text-xs text-muted-foreground">{u.major}</p>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </TabsContent>

                  {/* Group Chat Tab */}
                  <TabsContent value="group" className="space-y-3">
                    {/* Selected members */}
                    {groupMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {groupMembers.map(m => (
                          <Badge key={m.user_id} variant="secondary" className="gap-1 pr-1 rounded-lg">
                            {m.name}
                            <button onClick={() => toggleGroupMember(m)} className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input placeholder="Search users to add..." className="pl-9 rounded-xl" value={groupSearch} onChange={e => searchGroupUsers(e.target.value)} />
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {groupSearchResults.map(u => {
                        const isSelected = groupMembers.some(m => m.user_id === u.user_id);
                        return (
                          <button
                            key={u.user_id}
                            onClick={() => toggleGroupMember({ user_id: u.user_id, name: u.name })}
                            className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-accent"}`}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-primary/10 text-primary">{u.name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{u.name}</p>
                              {u.major && <p className="text-xs text-muted-foreground">{u.major}</p>}
                            </div>
                            {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                    <Button
                      onClick={createGroupChat}
                      disabled={groupMembers.length < 2 || creatingGroup}
                      className="w-full rounded-xl"
                    >
                      {creatingGroup ? "Creating..." : `Create Group (${groupMembers.length} members)`}
                    </Button>
                    {groupMembers.length < 2 && groupMembers.length > 0 && (
                      <p className="text-xs text-muted-foreground text-center">Add at least 2 members to create a group</p>
                    )}
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>

          <ScrollArea className="flex-1">
            {conversations.map(c => (
              <div
                key={c.id}
                className={`group relative flex items-center gap-3 p-4 text-left transition-colors border-b border-border/50 ${selectedConvo === c.id ? "bg-accent" : "hover:bg-accent/50"}`}
              >
                <button
                  onClick={() => setSelectedConvo(c.id)}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={c.participants[0]?.avatar_url || undefined} alt={c.participants[0]?.name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">{c.participants[0]?.name?.charAt(0)?.toUpperCase() || "?"}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium truncate text-left">{c.participants.map(p => p.name).join(", ") || "Conversation"}</p>
                    <p className="text-xs text-muted-foreground truncate text-left max-w-[160px]">{c.lastMessage || "No messages yet"}</p>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {conversations.length === 0 && (
              <div className="p-6 text-center text-muted-foreground text-sm">
                No conversations yet. Click + to start one!
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat area */}
        <div className="flex-1 flex flex-col">
          {selectedConvo ? (
            <>
              <div className="p-4 border-b border-border flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={otherAvatar || undefined} alt={otherName} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">{otherName.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <h3 className="font-semibold">{otherName}</h3>
              </div>

              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3">
                  {messages.map(msg => {
                    const isMe = msg.sender_id === user?.id;
                    // Detect reel share messages
                    const reelMatch = msg.content?.match(/🎬 Shared a reel: "(.+?)"\n.*\/reels\?id=([a-f0-9-]+)/);
                    const reelTitle = reelMatch?.[1];
                    const reelId = reelMatch?.[2];

                    return (
                      <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${isMe ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          {reelId && reelTitle ? (
                            <button
                              onClick={() => navigate(`/reels?id=${reelId}`)}
                              className="w-full text-left group"
                            >
                              <div className={`flex items-center gap-3 rounded-xl p-2.5 -mx-1 transition-colors ${isMe ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" : "bg-background/60 hover:bg-background/80"}`}>
                                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg ${isMe ? "bg-primary-foreground/20" : "bg-primary/10"}`}>
                                  <Play className={`h-5 w-5 ml-0.5 ${isMe ? "text-primary-foreground" : "text-primary"}`} fill="currentColor" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <Film className={`h-3 w-3 shrink-0 ${isMe ? "text-primary-foreground/70" : "text-primary"}`} />
                                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${isMe ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                                      Reel
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium truncate">{reelTitle}</p>
                                  <p className={`text-[10px] ${isMe ? "text-primary-foreground/50" : "text-muted-foreground"}`}>Tap to watch</p>
                                </div>
                              </div>
                            </button>
                          ) : (
                            msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                          )}
                          {msg.attachments?.map(att => (
                            <div key={att.id} className="mt-2">
                              {att.file_type === "image" ? (
                                <img src={att.file_url} alt={att.file_name} className="rounded-lg max-w-full max-h-48 object-cover" />
                              ) : (
                                <a href={att.file_url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 text-xs underline ${isMe ? "text-primary-foreground/80" : "text-primary"}`}>
                                  <FileText className="h-3 w-3" /> {att.file_name}
                                </a>
                              )}
                            </div>
                          ))}
                          <p className={`text-[10px] mt-1 ${isMe ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                            {format(new Date(msg.created_at), "h:mm a")}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Attachment preview */}
              {attachments.length > 0 && (
                <div className="px-4 py-2 border-t border-border flex gap-2 flex-wrap">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-1 bg-muted rounded-lg px-2 py-1 text-xs">
                      {f.type.startsWith("image/") ? <Image className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      <span className="max-w-24 truncate">{f.name}</span>
                      <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 border-t border-border flex gap-2">
                <input type="file" ref={fileInputRef} className="hidden" multiple onChange={e => {
                  if (e.target.files) setAttachments(prev => [...prev, ...Array.from(e.target.files!)]);
                }} />
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-4 w-4" />
                </Button>
                <Input
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  className="flex-1"
                />
                <Button onClick={sendMessage} disabled={sending || (!newMessage.trim() && !attachments.length)} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Send className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Select a conversation</p>
                <p className="text-sm">or start a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
