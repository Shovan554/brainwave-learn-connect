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
    const { fileUrl, fileName } = await req.json();
    if (!fileUrl) throw new Error("fileUrl is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Determine file type from name
    const ext = (fileName || fileUrl).split(".").pop()?.toLowerCase() || "";
    const isPresentation = ["ppt", "pptx", "key"].includes(ext);
    const isPdf = ext === "pdf";
    const isDoc = ["doc", "docx"].includes(ext);
    const isReadable = isPresentation || isPdf || isDoc || ["txt", "md", "csv"].includes(ext);

    if (!isReadable) {
      return new Response(
        JSON.stringify({ summary: "This file type cannot be summarized. Supported types: PPT, PPTX, PDF, DOC, DOCX, TXT, MD, CSV." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download the file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error(`Failed to download file: ${fileResponse.status}`);
    const fileBytes = await fileResponse.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));

    // Determine MIME type
    let mimeType = "application/octet-stream";
    if (isPresentation) mimeType = ext === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : "application/vnd.ms-powerpoint";
    else if (isPdf) mimeType = "application/pdf";
    else if (isDoc) mimeType = ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/msword";
    else if (ext === "txt" || ext === "md" || ext === "csv") mimeType = "text/plain";

    // Call AI with the file using image_url format (supports documents in Gemini)
    const dataUri = `data:${mimeType};base64,${base64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content: `You are a study assistant. Given a document, provide:
1. A concise **Summary** (3-5 sentences covering the main points)
2. **Key Notes** (bullet points of the most important concepts, definitions, and takeaways)
3. **Study Tips** (2-3 actionable tips for studying this material)

Format your response in clean Markdown. Be thorough but concise. Focus on what a student needs to know for exams.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUri },
              },
              {
                type: "text",
                text: `Please summarize this ${isPresentation ? "presentation" : "document"} ("${fileName || "file"}") and provide key study notes.`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || "Could not generate summary.";

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-asset error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
