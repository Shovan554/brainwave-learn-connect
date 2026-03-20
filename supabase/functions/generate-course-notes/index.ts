import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { courseId } = await req.json();
    if (!courseId) throw new Error("courseId is required");

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader! } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    // Get course info
    const { data: course } = await supabase
      .from("courses")
      .select("title, term, description")
      .eq("id", courseId)
      .single();
    if (!course) throw new Error("Course not found");

    // Get all weekly content
    const { data: weeks } = await supabase
      .from("weekly_content")
      .select("week_number, title, description")
      .eq("course_id", courseId)
      .eq("is_published", true)
      .order("week_number");

    // Get all weekly content assets (files/links)
    const weekIds = (weeks || []).map((w: any) => w.id);
    let assets: any[] = [];
    if (weeks && weeks.length > 0) {
      const { data: allWeeks } = await supabase
        .from("weekly_content")
        .select("id, week_number, title")
        .eq("course_id", courseId)
        .eq("is_published", true);
      
      const ids = (allWeeks || []).map((w: any) => w.id);
      if (ids.length > 0) {
        const { data: a } = await supabase
          .from("weekly_content_assets")
          .select("weekly_content_id, file_name, link_url")
          .in("weekly_content_id", ids);
        assets = a || [];
      }
    }

    // Get syllabus files
    const { data: syllabusFiles } = await supabase
      .from("course_files")
      .select("file_name")
      .eq("course_id", courseId);

    // Build context for AI
    let context = `Course: ${course.title}\nTerm: ${course.term}\nDescription: ${course.description || "N/A"}\n\n`;

    if (syllabusFiles && syllabusFiles.length > 0) {
      context += "Syllabus Files:\n";
      syllabusFiles.forEach((f: any) => { context += `- ${f.file_name}\n`; });
      context += "\n";
    }

    if (weeks && weeks.length > 0) {
      context += "Weekly Content:\n";
      weeks.forEach((w: any) => {
        context += `\n### Week ${w.week_number}: ${w.title}\n`;
        if (w.description) context += `${w.description}\n`;
        const weekAssets = assets.filter((a: any) => a.weekly_content_id === w.id);
        if (weekAssets.length > 0) {
          context += "Materials:\n";
          weekAssets.forEach((a: any) => {
            context += `- ${a.file_name || a.link_url}\n`;
          });
        }
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("AI key not configured");

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert academic note-taker. Based on the course structure and materials provided, generate comprehensive, well-organized semester lecture notes in Markdown format. 

Include:
- A title and course overview
- Week-by-week summaries with key concepts, definitions, and takeaways
- Important topics and themes that span multiple weeks
- A final summary section with key takeaways for exam preparation

Make the notes detailed, educational, and useful for students studying for exams. Use proper markdown formatting with headers, bullet points, bold text for key terms, and organized sections.`
          },
          {
            role: "user",
            content: `Generate comprehensive semester lecture notes for this course:\n\n${context}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI generation failed");
    }

    const aiData = await aiResponse.json();
    const notes = aiData.choices?.[0]?.message?.content || "No notes generated.";

    // Upsert into course_notes
    const { error: upsertError } = await supabase
      .from("course_notes")
      .upsert({
        course_id: courseId,
        content: notes,
        generated_at: new Date().toISOString(),
        generated_by: user.id,
      }, { onConflict: "course_id" });

    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ notes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-course-notes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
