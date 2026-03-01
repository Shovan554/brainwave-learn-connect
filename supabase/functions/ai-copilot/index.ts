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
    const { messages, courseId, action, userToken } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve user from token to get their enrollments
    let userId: string | null = null;
    if (userToken) {
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user } } = await anonClient.auth.getUser(userToken);
      userId = user?.id || null;
    }

    let courseContext = "";

    if (courseId) {
      // Single course context (existing behavior)
      const { data: course } = await supabase
        .from("courses")
        .select("title, term, description")
        .eq("id", courseId)
        .single();

      const { data: weeks } = await supabase
        .from("weekly_content")
        .select("week_number, title, description, is_published")
        .eq("course_id", courseId)
        .order("week_number");

      const { data: assignments } = await supabase
        .from("assignments")
        .select("title, description, due_date, points, weight, estimated_time_minutes, is_published")
        .eq("course_id", courseId)
        .order("due_date");

      const { data: syllabusFiles } = await supabase
        .from("course_files")
        .select("file_name")
        .eq("course_id", courseId);

      courseContext = `Course: ${course?.title || "Unknown"}\nTerm: ${course?.term || ""}\nDescription: ${course?.description || ""}\n\n`;

      if (syllabusFiles?.length) {
        courseContext += `Syllabus files: ${syllabusFiles.map(f => f.file_name).join(", ")}\n\n`;
      }

      if (weeks?.length) {
        courseContext += "Weekly Content:\n";
        for (const w of weeks) {
          courseContext += `- Week ${w.week_number}: ${w.title} — ${w.description || "No description"} (${w.is_published ? "Published" : "Draft"})\n`;
        }
        courseContext += "\n";
      }

      if (assignments?.length) {
        courseContext += "Assignments:\n";
        for (const a of assignments) {
          courseContext += `- ${a.title}: ${a.description || ""} | Due: ${a.due_date || "TBD"} | ${a.points} pts | ${a.weight}% weight | ~${a.estimated_time_minutes}min (${a.is_published ? "Published" : "Draft"})\n`;
        }
      }
    } else if (userId && action === "student") {
      // No specific course — fetch all enrolled courses and their assignments
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("course_id")
        .eq("student_id", userId);

      if (enrollments?.length) {
        const courseIds = enrollments.map(e => e.course_id);

        const { data: courses } = await supabase
          .from("courses")
          .select("id, title, term")
          .in("id", courseIds);

        const { data: allAssignments } = await supabase
          .from("assignments")
          .select("title, description, due_date, points, weight, estimated_time_minutes, course_id, is_published")
          .in("course_id", courseIds)
          .eq("is_published", true)
          .order("due_date");

        const { data: submissions } = await supabase
          .from("assignment_submissions")
          .select("assignment_id, grade, graded_at, submitted_at")
          .eq("student_id", userId);

        const subMap: Record<string, any> = {};
        if (submissions) {
          for (const s of submissions) subMap[s.assignment_id] = s;
        }

        const courseMap: Record<string, string> = {};
        if (courses) {
          for (const c of courses) courseMap[c.id] = c.title;
        }

        courseContext = `You have access to all of this student's enrolled courses and assignments.\n\n`;
        courseContext += `Enrolled Courses: ${courses?.map(c => `${c.title} (${c.term})`).join(", ") || "None"}\n\n`;

        if (allAssignments?.length) {
          courseContext += "All Assignments (across all courses):\n";
          for (const a of allAssignments) {
            const sub = subMap[a.title] || null; // won't match by title, use below
            courseContext += `- [${courseMap[a.course_id] || "Unknown"}] ${a.title}: ${a.description || ""} | Due: ${a.due_date || "TBD"} | ${a.points} pts | ${a.weight}% weight | ~${a.estimated_time_minutes}min\n`;
          }
          courseContext += "\n";

          // Add submission status
          if (submissions?.length) {
            courseContext += "Your Submissions:\n";
            for (const s of submissions) {
              courseContext += `- Assignment submitted at ${s.submitted_at}${s.graded_at ? ` | Grade: ${s.grade}` : " | Not yet graded"}\n`;
            }
          }
        }
      }
    } else if (userId && action === "teacher") {
      // Teacher without specific course — fetch all their courses
      const { data: courses } = await supabase
        .from("courses")
        .select("id, title, term")
        .eq("teacher_id", userId);

      if (courses?.length) {
        const courseIds = courses.map(c => c.id);

        const { data: allAssignments } = await supabase
          .from("assignments")
          .select("title, description, due_date, points, course_id, is_published")
          .in("course_id", courseIds)
          .order("due_date");

        const { data: enrollments } = await supabase
          .from("enrollments")
          .select("course_id")
          .in("course_id", courseIds);

        const enrollCounts: Record<string, number> = {};
        if (enrollments) {
          for (const e of enrollments) {
            enrollCounts[e.course_id] = (enrollCounts[e.course_id] || 0) + 1;
          }
        }

        courseContext = `You have access to all of this teacher's courses.\n\n`;
        courseContext += "Courses:\n";
        for (const c of courses) {
          courseContext += `- ${c.title} (${c.term}) — ${enrollCounts[c.id] || 0} students enrolled\n`;
        }
        courseContext += "\n";

        if (allAssignments?.length) {
          courseContext += "All Assignments:\n";
          for (const a of allAssignments) {
            const cName = courses.find(c => c.id === a.course_id)?.title || "";
            courseContext += `- [${cName}] ${a.title}: ${a.description || ""} | Due: ${a.due_date || "TBD"} | ${a.points} pts (${a.is_published ? "Published" : "Draft"})\n`;
          }
        }
      }
    }

    // Determine system prompt
    let systemPrompt = "";
    if (action === "teacher") {
      systemPrompt = `You are an AI teaching assistant. Help the teacher with:
- Suggesting syllabus improvements
- Drafting quiz questions aligned to specific modules/weeks
- Suggesting teaching strategies
- Creating rubrics for assignments
- Providing an overview of all courses and assignments

${courseContext ? `Context:\n${courseContext}` : "No course context available."}

Be specific and reference the actual course content when giving suggestions.`;
    } else {
      systemPrompt = `You are a helpful AI study copilot. You help students by:
- Generating study notes for specific weeks
- Explaining key concepts from course material
- Creating practice quiz questions
- Providing study strategies and tips
- Giving an overview of all assignments, due dates, and priorities
- Telling the student what they need to work on next
- Giving outlines and guidance (but NEVER completing assignments for students)

${courseContext ? `Context:\n${courseContext}` : "No course context available."}

Always reference the actual course content. If asked to complete an assignment, politely decline and offer to help the student understand the concepts instead. Cite specific courses and assignments when relevant.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-copilot error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
