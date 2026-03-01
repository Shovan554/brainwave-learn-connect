import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, Send, Loader2, X, BookOpen, HelpCircle, ListChecks,
  MessageCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract courseId from URL if on a course page
  const courseMatch = location.pathname.match(/\/courses\/([^/]+)/);
  const courseId = courseMatch?.[1] || null;
  const mode = role || "student";
  const quickActions = mode === "teacher" ? QUICK_TEACHER : QUICK_STUDENT;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  if (!user) return null;

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      // Get current session token
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
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all duration-300 hover:scale-110 ${
          open
            ? "bg-muted text-foreground rotate-0"
            : "bg-primary text-primary-foreground animate-[pulse_3s_ease-in-out_infinite]"
        }`}
        aria-label="Toggle AI assistant"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in duration-300">
          {/* Header */}
          <div className="flex items-center gap-2 border-b bg-primary px-4 py-3">
            <Brain className="h-5 w-5 text-primary-foreground" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-primary-foreground">
                AI {mode === "teacher" ? "Teaching Assistant" : "Study Copilot"}
              </p>
              <p className="text-xs text-primary-foreground/70">
                {courseId ? "Course context active" : "General mode"}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="text-primary-foreground/70 hover:text-primary-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 && (
              <div className="space-y-3 pt-4">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  {mode === "teacher" ? "How can I help with your course?" : "What would you like to learn?"}
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {quickActions.map((qa) => (
                    <Button
                      key={qa.label}
                      variant="outline"
                      size="sm"
                      className="gap-1 text-xs h-7 transition-all duration-200 hover:bg-primary hover:text-primary-foreground"
                      onClick={() => sendMessage(qa.prompt)}
                    >
                      <qa.icon className="h-3 w-3" />
                      {qa.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm transition-all duration-200 ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted rounded-bl-sm"
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
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t bg-card p-3">
            <div className="flex gap-2">
              <Textarea
                placeholder="Ask anything..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input);
                  }
                }}
                rows={1}
                className="min-h-[40px] resize-none rounded-xl"
              />
              <Button
                size="icon"
                className="rounded-xl shrink-0 transition-transform duration-200 hover:scale-105"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
