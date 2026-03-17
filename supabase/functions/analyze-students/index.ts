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

    // Verify teacher
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(userToken);
    if (!user) throw new Error("Invalid user token");

    // Get teacher's courses
    const { data: courses } = await supabase
      .from("courses")
      .select("id, title")
      .eq("teacher_id", user.id);

    if (!courses?.length) {
      return new Response(JSON.stringify({ analysis: "No courses found." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const courseIds = courses.map(c => c.id);
    const courseMap: Record<string, string> = {};
    for (const c of courses) courseMap[c.id] = c.title;

    // Get all enrollments, assignments, submissions in parallel
    const [enrollRes, assignRes, subRes] = await Promise.all([
      supabase.from("enrollments").select("student_id, course_id").in("course_id", courseIds),
      supabase.from("assignments").select("id, title, due_date, points, course_id").in("course_id", courseIds).eq("is_published", true),
      supabase.from("assignment_submissions").select("assignment_id, student_id, grade, submitted_at").in("assignment_id",
        (await supabase.from("assignments").select("id").in("course_id", courseIds).eq("is_published", true)).data?.map(a => a.id) || []
      ),
    ]);

    const enrollments = enrollRes.data || [];
    const assignments = assignRes.data || [];
    const submissions = subRes.data || [];

    // Get student profiles
    const studentIds = [...new Set(enrollments.map(e => e.student_id))];
    if (!studentIds.length) {
      return new Response(JSON.stringify({ analysis: "No students enrolled yet." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name")
      .in("user_id", studentIds);

    const profileMap: Record<string, string> = {};
    for (const p of (profiles || [])) profileMap[p.user_id] = p.name;

    const now = Date.now();

    // Build per-student data
    let context = `Teacher: ${user.user_metadata?.name || "Professor"}\n`;
    context += `Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}\n`;
    context += `Courses: ${courses.map(c => c.title).join(", ")}\n\n`;

    for (const sid of studentIds) {
      const name = profileMap[sid] || "Unknown";
      const studentCourses = enrollments.filter(e => e.student_id === sid).map(e => e.course_id);
      const studentAssignments = assignments.filter(a => studentCourses.includes(a.course_id));
      const studentSubs = submissions.filter(s => s.student_id === sid);
      const submittedIds = new Set(studentSubs.map(s => s.assignment_id));

      const missing = studentAssignments.filter(a => !submittedIds.has(a.id));
      const pastDue = missing.filter(a => a.due_date && new Date(a.due_date).getTime() < now);
      const graded = studentSubs.filter(s => s.grade != null);
      const totalEarned = graded.reduce((s, g) => s + (g.grade || 0), 0);
      const totalPossible = graded.reduce((s, g) => {
        const a = assignments.find(x => x.id === g.assignment_id);
        return s + (a?.points || 0);
      }, 0);
      const avgPct = totalPossible > 0 ? ((totalEarned / totalPossible) * 100).toFixed(1) : "N/A";

      context += `STUDENT: ${name}\n`;
      context += `  Enrolled: ${studentCourses.map(id => courseMap[id]).join(", ")}\n`;
      context += `  Submitted: ${submittedIds.size}/${studentAssignments.length} | Grade avg: ${avgPct}%\n`;
      if (pastDue.length) {
        context += `  ⚠️ Past due (${pastDue.length}): ${pastDue.map(a => `${a.title} (${courseMap[a.course_id]})`).join(", ")}\n`;
      }
      if (missing.length > pastDue.length) {
        const upcoming = missing.filter(a => !a.due_date || new Date(a.due_date).getTime() >= now);
        context += `  Upcoming missing (${upcoming.length}): ${upcoming.slice(0, 3).map(a => a.title).join(", ")}${upcoming.length > 3 ? "..." : ""}\n`;
      }
      context += "\n";
    }

    const systemPrompt = `You are an AI teaching assistant analyzing student performance across a teacher's courses. Given detailed student data, provide a STRUCTURED analysis:

1. Start with a brief overview (1 sentence)
2. List students who need IMMEDIATE attention (past due, low grades, many missing) with specific details
3. List students who are doing well but could improve
4. Any patterns you notice (e.g., common assignments being missed)
5. 1-2 actionable recommendations for the teacher

Use student names and course names. Keep it concise but actionable. Use emoji for visual scanning (🔴 critical, 🟡 warning, 🟢 doing well). Format with clear sections.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ analysis: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const analysis = result.choices?.[0]?.message?.content || null;

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-students error:", e);
    return new Response(JSON.stringify({ analysis: null, error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
