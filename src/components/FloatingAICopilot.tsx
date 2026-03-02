import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Send, Loader2, X, BookOpen, HelpCircle, ListChecks,
  MessageCircle, Download, Sparkles, Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { motion, AnimatePresence } from "framer-motion";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_STUDENT = [
  { label: "Study Notes", prompt: "Generate study notes for the most recent week's content", icon: BookOpen },
  { label: "Key Concepts", prompt: "What are the key concepts I should understand?", icon: HelpCircle },
  { label: "Practice Quiz", prompt: "Create a practice quiz with 5 questions", icon: ListChecks },
];

const QUICK_TEACHER = [
  { label: "Syllabus Ideas", prompt: "Suggest improvements to the course syllabus", icon: BookOpen },
  { label: "Quiz Questions", prompt: "Draft 5 quiz questions", icon: ListChecks },
  { label: "Rubric", prompt: "Create a grading rubric for the most recent assignment", icon: Brain },
];

export function FloatingAICopilot() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [savingIdx, setSavingIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const courseMatch = location.pathname.match(/\/courses\/([^/]+)/);
  const courseId = courseMatch?.[1] || null;
  const mode = role || "student";
  const quickActions = mode === "teacher" ? QUICK_TEACHER : QUICK_STUDENT;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!user) return null;

  const downloadAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveAndDownload = async (content: string, idx: number) => {
    setSavingIdx(idx);
    const filename = `ai-notes-${new Date().toISOString().slice(0, 10)}-${idx}.md`;

    // Download locally
    downloadAsFile(content, filename);

    // Save to storage if we have a courseId
    if (courseId && user) {
      try {
        const filePath = `ai-notes/${user.id}/${courseId}/${Date.now()}_${filename}`;
        const blob = new Blob([content], { type: "text/markdown" });
        const { error: uploadError } = await supabase.storage
          .from("course-files")
          .upload(filePath, blob);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("course-files")
            .getPublicUrl(filePath);

          await supabase.from("course_files").insert({
            course_id: courseId,
            uploaded_by: user.id,
            file_name: filename,
            file_type: "ai-notes",
            file_url: urlData.publicUrl,
          });

          toast({ title: "Saved!", description: "Notes saved to your course files & downloaded" });
        } else {
          toast({ title: "Downloaded", description: "File downloaded (save to cloud skipped)" });
        }
      } catch {
        toast({ title: "Downloaded", description: "File downloaded locally" });
      }
    } else {
      toast({ title: "Downloaded!", description: "Notes downloaded as markdown file" });
    }
    setSavingIdx(null);
  };

  const clearChat = () => {
    setMessages([]);
    setInput("");
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userToken = session?.access_token || "";

      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          courseId: courseId || "",
          action: mode,
          userToken,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "AI request failed" }));
        toast({ title: "AI Error", description: err.error || "Request failed", variant: "destructive" });
        setIsLoading(false);
        return;
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      const upsertAssistant = (chunk: string) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      };

      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) upsertAssistant(content);
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to connect to AI", variant: "destructive" });
    }

    setIsLoading(false);
  };

  return (
    <>
      {/* Floating button */}
      <motion.button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg ${
          open
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground"
        }`}
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.9 }}
        animate={open ? { rotate: 90 } : { rotate: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
        aria-label="Toggle AI assistant"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-6 w-6" />
            </motion.div>
          ) : (
            <motion.div key="open" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
              <Sparkles className="h-6 w-6" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Glow ring when closed */}
      {!open && (
        <motion.div
          className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full bg-primary/20"
          animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[400px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            {/* Header */}
            <div className="relative flex items-center gap-3 bg-primary px-4 py-3.5 overflow-hidden">
              {/* Subtle animated gradient overlay */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-primary-foreground/5 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              />
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary-foreground/15">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="relative flex-1">
                <p className="text-sm font-semibold text-primary-foreground">
                  AI {mode === "teacher" ? "Teaching Assistant" : "Study Copilot"}
                </p>
                <p className="text-xs text-primary-foreground/70">
                  {courseId ? "Course context active" : "All courses mode"}
                </p>
              </div>
              <div className="relative flex items-center gap-1">
                {messages.length > 0 && (
                  <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    onClick={clearChat}
                    className="rounded-lg p-1.5 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors"
                    title="Clear chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </motion.button>
                )}
                <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-primary-foreground/60 hover:text-primary-foreground hover:bg-primary-foreground/10 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="space-y-4 pt-6"
                >
                  <motion.div
                    className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10"
                    animate={{ rotate: [0, 5, -5, 0] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <Sparkles className="h-7 w-7 text-primary" />
                  </motion.div>
                  <p className="text-center text-sm text-muted-foreground">
                    {mode === "teacher" ? "How can I help with your courses?" : "What would you like to learn today?"}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {quickActions.map((qa, i) => (
                      <motion.div
                        key={qa.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + i * 0.08 }}
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8 rounded-full border-primary/20 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-200"
                          onClick={() => sendMessage(qa.prompt)}
                        >
                          <qa.icon className="h-3 w-3" />
                          {qa.label}
                        </Button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className="group relative">
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted rounded-bl-md"
                      }`}
                    >
                      {m.role === "assistant" ? (
                        <div className="prose prose-sm max-w-none dark:prose-invert">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        m.content
                      )}
                    </div>

                    {/* Save/Download button for assistant messages */}
                    {m.role === "assistant" && !isLoading && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="mt-1.5 flex gap-1"
                      >
                        <button
                          onClick={() => saveAndDownload(m.content, i)}
                          disabled={savingIdx === i}
                          className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                        >
                          {savingIdx === i ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3" />
                          )}
                          {courseId ? "Save & Download" : "Download"}
                        </button>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              ))}

              {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                    <div className="flex gap-1.5">
                      {[0, 150, 300].map((delay) => (
                        <motion.span
                          key={delay}
                          className="h-2 w-2 rounded-full bg-primary/40"
                          animate={{ y: [0, -6, 0] }}
                          transition={{ duration: 0.6, repeat: Infinity, delay: delay / 1000 }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input */}
            <div className="border-t bg-card/80 backdrop-blur-sm p-3">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Ask anything about your courses..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage(input);
                    }
                  }}
                  rows={1}
                  className="min-h-[40px] resize-none rounded-xl border-primary/20 focus:border-primary"
                />
                <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    size="icon"
                    className="rounded-xl shrink-0"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || isLoading}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </motion.div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
