import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { userToken } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve user
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(userToken);
    if (!user) throw new Error("Invalid user token");
    const userId = user.id;

    // Get profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", userId)
      .single();

    // Get enrollments + courses
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("course_id")
      .eq("student_id", userId);

    if (!enrollments?.length) {
      return new Response(JSON.stringify({ insight: "Welcome! Join a course using an invite code to get started. Your AI advisor will give you personalized tips once you're enrolled." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const courseIds = enrollments.map(e => e.course_id);

    const [coursesRes, assignmentsRes, submissionsRes] = await Promise.all([
      supabase.from("courses").select("id, title, term").in("id", courseIds),
      supabase.from("assignments").select("id, title, due_date, points, weight, estimated_time_minutes, course_id").in("course_id", courseIds).eq("is_published", true).order("due_date"),
      supabase.from("assignment_submissions").select("assignment_id, grade, graded_at, submitted_at").eq("student_id", userId),
    ]);

    const courses = coursesRes.data || [];
    const allAssignments = assignmentsRes.data || [];
    const allSubmissions = submissionsRes.data || [];
    const submittedIds = new Set(allSubmissions.map(s => s.assignment_id));
    const now = Date.now();

    // Build context
    const courseMap: Record<string, string> = {};
    for (const c of courses) courseMap[c.id] = c.title;

    const pastDue = allAssignments.filter(a => a.due_date && new Date(a.due_date).getTime() < now && !submittedIds.has(a.id));
    const upcoming = allAssignments.filter(a => !a.due_date || new Date(a.due_date).getTime() >= now).filter(a => !submittedIds.has(a.id));
    const graded = allSubmissions.filter(s => s.grade != null);

    // Course grades
    const courseGrades: string[] = [];
    for (const c of courses) {
      const cAssignments = allAssignments.filter(a => a.course_id === c.id);
      const cGraded = cAssignments
        .map(a => {
          const sub = allSubmissions.find(s => s.assignment_id === a.id);
          return sub?.grade != null ? { grade: sub.grade, points: a.points || 0 } : null;
        })
        .filter(Boolean) as { grade: number; points: number }[];
      const earned = cGraded.reduce((s, g) => s + g.grade, 0);
      const total = cGraded.reduce((s, g) => s + g.points, 0);
      if (total > 0) {
        courseGrades.push(`${c.title}: ${((earned / total) * 100).toFixed(1)}%`);
      }
    }

    let context = `Student: ${profile?.name || "Student"}\n`;
    context += `Today: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n`;
    context += `Enrolled in ${courses.length} courses: ${courses.map(c => c.title).join(", ")}\n`;
    context += `Total assignments: ${allAssignments.length}, Submitted: ${submittedIds.size}, Past due (not submitted): ${pastDue.length}\n`;
    if (courseGrades.length) context += `Course grades: ${courseGrades.join("; ")}\n`;

    if (pastDue.length) {
      context += `\nPast due assignments:\n`;
      for (const a of pastDue) {
        context += `- ${a.title} (${courseMap[a.course_id]}) — was due ${new Date(a.due_date!).toLocaleDateString()}, ${a.points} pts\n`;
      }
    }

    if (upcoming.length) {
      context += `\nUpcoming assignments (not yet submitted):\n`;
      for (const a of upcoming.slice(0, 8)) {
        const dueStr = a.due_date ? new Date(a.due_date).toLocaleDateString() : "No date";
        const hoursLeft = a.due_date ? Math.round((new Date(a.due_date).getTime() - now) / (1000 * 60 * 60)) : null;
        context += `- ${a.title} (${courseMap[a.course_id]}) — due ${dueStr}${hoursLeft !== null ? ` (${hoursLeft}h left)` : ""}, ${a.points} pts, ~${a.estimated_time_minutes || 30}min\n`;
      }
    }

    const systemPrompt = `You are a concise AI academic advisor. Given a student's current academic snapshot, provide a SHORT, actionable insight (2-3 sentences max). Focus on:
- What they should work on RIGHT NOW and why
- Any urgent warnings (past due, low grades, upcoming deadlines)
- One motivational or strategic tip

Be direct, friendly, and specific. Reference actual course names and assignment names. Use emoji sparingly (1-2 max). Do NOT use markdown headers or bullet points — just flowing sentences.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context },
        ],
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ insight: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const insight = result.choices?.[0]?.message?.content || null;

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dashboard-insight error:", e);
    return new Response(JSON.stringify({ insight: null, error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
