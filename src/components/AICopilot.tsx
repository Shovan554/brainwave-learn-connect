import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, BookOpen, HelpCircle, ListChecks, Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface AICopilotProps {
  courseId: string;
  mode: "student" | "teacher";
}

type Msg = { role: "user" | "assistant"; content: string };

const QUICK_ACTIONS_STUDENT = [
  { label: "Study Notes", prompt: "Generate study notes for the most recent week's content", icon: BookOpen },
  { label: "Key Concepts", prompt: "What are the key concepts I should understand from this course so far?", icon: HelpCircle },
  { label: "Practice Quiz", prompt: "Create a practice quiz with 5 questions based on the course material", icon: ListChecks },
];

const QUICK_ACTIONS_TEACHER = [
  { label: "Syllabus Ideas", prompt: "Suggest improvements to the course syllabus based on current content", icon: BookOpen },
  { label: "Quiz Questions", prompt: "Draft 5 quiz questions aligned to the weekly content modules", icon: ListChecks },
  { label: "Rubric", prompt: "Create a grading rubric for the most recent assignment", icon: Brain },
];

export function AICopilot({ courseId, mode }: AICopilotProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickActions = mode === "teacher" ? QUICK_ACTIONS_TEACHER : QUICK_ACTIONS_STUDENT;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: Msg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";

    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-copilot`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          courseId,
          action: mode,
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
    <Card className="flex h-[600px] flex-col">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Brain className="h-4 w-4 text-primary" />
          AI {mode === "teacher" ? "Teaching Assistant" : "Study Copilot"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                {mode === "teacher" ? "Ask me to help with your course!" : "Ask me anything about your course!"}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {quickActions.map((qa) => (
                  <Button
                    key={qa.label}
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
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
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
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
              <div className="rounded-lg bg-muted px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t p-3">
          <div className="flex gap-2">
            <Textarea
              placeholder="Ask about your course..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
              rows={1}
              className="min-h-[40px] resize-none"
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
