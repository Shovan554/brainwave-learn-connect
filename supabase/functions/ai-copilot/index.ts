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
    const { messages, courseId, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Get auth token from request
    const authHeader = req.headers.get("authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch course context
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

    const { data: weekAssets } = await supabase
      .from("weekly_content_assets")
      .select("file_name, link_url, weekly_content_id")
      .in("weekly_content_id", (weeks || []).map(w => w.id || "").filter(Boolean));

    const { data: syllabusFiles } = await supabase
      .from("course_files")
      .select("file_name")
      .eq("course_id", courseId);

    // Build context
    let courseContext = `Course: ${course?.title || "Unknown"}\nTerm: ${course?.term || ""}\nDescription: ${course?.description || ""}\n\n`;

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

    // Determine system prompt based on action type
    let systemPrompt = "";
    if (action === "teacher") {
      systemPrompt = `You are an AI teaching assistant for the course described below. Help the teacher with:
- Suggesting syllabus improvements
- Drafting quiz questions aligned to specific modules/weeks
- Suggesting teaching strategies
- Creating rubrics for assignments

Course Context:
${courseContext}

Be specific and reference the actual course content when giving suggestions.`;
    } else {
      systemPrompt = `You are a helpful AI study copilot for the course described below. You help students by:
- Generating study notes for specific weeks
- Explaining key concepts from course material
- Creating practice quiz questions
- Providing study strategies and tips
- Giving outlines and guidance (but NEVER completing assignments for students)

Course Context:
${courseContext}

Always reference the actual course content. If asked to complete an assignment, politely decline and offer to help the student understand the concepts instead. Cite specific weeks or modules when relevant.`;
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
