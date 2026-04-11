import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { courseId } = await req.json();
    if (!courseId) {
      return new Response(JSON.stringify({ error: "courseId is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Fetch course info + weekly content
    const headers = {
      "apikey": SUPABASE_SERVICE_ROLE_KEY,
      "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    };

    const [courseRes, weeklyRes, assignmentsRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/courses?id=eq.${courseId}&select=title,description,term`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/weekly_content?course_id=eq.${courseId}&select=title,description,week_number&order=week_number.asc`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/assignments?course_id=eq.${courseId}&select=title,description&is_published=eq.true&limit=10`, { headers }),
    ]);

    const [courses, weeks, assignments] = await Promise.all([
      courseRes.json(), weeklyRes.json(), assignmentsRes.json(),
    ]);

    const course = courses?.[0];
    if (!course) {
      return new Response(JSON.stringify({ error: "Course not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const syllabusContext = `
Course: ${course.title}
Term: ${course.term}
Description: ${course.description || "N/A"}

Weekly Topics:
${(weeks || []).map((w: any) => `- Week ${w.week_number}: ${w.title}${w.description ? ` — ${w.description}` : ""}`).join("\n")}

Assignments:
${(assignments || []).map((a: any) => `- ${a.title}${a.description ? `: ${a.description}` : ""}`).join("\n")}
    `.trim();

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an educational content creator specializing in short-form educational reels (like TikTok/Instagram Reels but for learning). 

Given a course syllabus, generate exactly 5 reel suggestions. Each reel should be a bite-sized educational nugget that teaches ONE key concept in an engaging way.

Return a JSON array of objects with these fields:
- title: A catchy, engaging title (max 60 chars)
- script: The full text content for the reel (3-5 bullet points or a short explanation, max 200 words). Use emojis sparingly for engagement.
- hook: A one-line attention-grabbing opener
- topic: Which week/topic this relates to
- color_theme: One of "blue", "purple", "green", "orange", "red", "pink" — pick based on topic mood

Make them informative, concise, and visually appealing when displayed as text cards. Think "Did you know?" facts, key formulas, common mistakes, quick tips, study hacks related to the course content.

IMPORTANT: Return ONLY the JSON array, no markdown formatting or code blocks.`
          },
          {
            role: "user",
            content: `Generate 5 educational reel suggestions for this course:\n\n${syllabusContext}`
          }
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI generation failed");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Parse the JSON from the AI response
    let suggestions;
    try {
      // Try to extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      suggestions = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI suggestions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ suggestions, courseName: course.title }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-reel-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
