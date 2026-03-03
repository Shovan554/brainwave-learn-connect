import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const ext = (fileName || fileUrl).split(".").pop()?.toLowerCase() || "";
    const isPresentation = ["ppt", "pptx", "key"].includes(ext);
    const isPdf = ext === "pdf";
    const isDoc = ["doc", "docx"].includes(ext);
    const isTextFile = ["txt", "md", "csv"].includes(ext);
    const isReadable = isPresentation || isPdf || isDoc || isTextFile;

    if (!isReadable) {
      return new Response(
        JSON.stringify({ summary: "This file type cannot be summarized. Supported types: PPT, PPTX, PDF, DOC, DOCX, TXT, MD, CSV." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download the file
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) throw new Error(`Failed to download file: ${fileResponse.status}`);

    let userContent: any[];

    if (isTextFile) {
      // Text files: send content directly
      const textContent = await fileResponse.text();
      userContent = [
        {
          type: "text",
          text: `Here is the content of "${fileName}":\n\n${textContent}\n\nPlease summarize this and provide key study notes.`,
        },
      ];
    } else if (isPdf) {
      // PDF: Gemini supports PDF via data URI
      const fileBytes = await fileResponse.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(fileBytes)));
      userContent = [
        {
          type: "image_url",
          image_url: { url: `data:application/pdf;base64,${base64}` },
        },
        {
          type: "text",
          text: `Please summarize this PDF document ("${fileName}") and provide key study notes.`,
        },
      ];
    } else {
      // PPT, PPTX, DOC, DOCX: Gemini doesn't support these MIME types directly.
      // Extract readable text from the binary. For Office XML formats (pptx, docx),
      // they are ZIP files containing XML — we can extract text from them.
      const fileBytes = await fileResponse.arrayBuffer();
      let extractedText = "";

      if (ext === "pptx" || ext === "docx") {
        try {
          // These are ZIP files — try to extract XML content
          extractedText = await extractTextFromOfficeXml(new Uint8Array(fileBytes), ext);
        } catch (e) {
          console.error("Failed to extract text from Office XML:", e);
        }
      }

      if (!extractedText) {
        // For old .ppt/.doc or failed extraction, try raw text extraction
        extractedText = extractReadableText(new Uint8Array(fileBytes));
      }

      if (!extractedText || extractedText.length < 20) {
        return new Response(
          JSON.stringify({ summary: `Unable to extract text from this ${ext.toUpperCase()} file. Try converting it to PDF or PPTX format for better results.` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      userContent = [
        {
          type: "text",
          text: `Here is the extracted text content from the ${isPresentation ? "presentation" : "document"} "${fileName}":\n\n${extractedText}\n\nPlease summarize this and provide key study notes.`,
        },
      ];
    }

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
            content: `You are a study assistant. Given a document or its extracted text, provide:
1. A concise **Summary** (3-5 sentences covering the main points)
2. **Key Notes** (bullet points of the most important concepts, definitions, and takeaways)
3. **Study Tips** (2-3 actionable tips for studying this material)

Format your response in clean Markdown. Be thorough but concise. Focus on what a student needs to know for exams.`,
          },
          { role: "user", content: userContent },
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
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

// Extract readable ASCII/UTF-8 text from binary files (works for old .ppt/.doc)
function extractReadableText(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let current = "";
  
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Printable ASCII or common whitespace
    if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b === 9) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= 4) {
        chunks.push(current.trim());
      }
      current = "";
    }
  }
  if (current.length >= 4) chunks.push(current.trim());

  // Filter out noise: keep strings that look like real text (have spaces, reasonable length)
  const meaningful = chunks.filter(c => c.length >= 6 && /\s/.test(c) && /[a-zA-Z]/.test(c));
  
  // Deduplicate
  const seen = new Set<string>();
  const unique = meaningful.filter(c => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });

  return unique.join("\n").slice(0, 30000); // Limit to ~30k chars
}

// Extract text from Office XML formats (pptx/docx are ZIP files)
async function extractTextFromOfficeXml(bytes: Uint8Array, ext: string): Promise<string> {
  // Simple ZIP parser to find XML files and extract text
  const texts: string[] = [];
  const decoder = new TextDecoder("utf-8", { fatal: false });
  
  // Find local file headers (PK\x03\x04)
  for (let i = 0; i < bytes.length - 30; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B && bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
      const fnameLen = bytes[i + 26] | (bytes[i + 27] << 8);
      const extraLen = bytes[i + 28] | (bytes[i + 29] << 8);
      const compSize = bytes[i + 18] | (bytes[i + 19] << 8) | (bytes[i + 20] << 16) | (bytes[i + 21] << 24);
      const compMethod = bytes[i + 8] | (bytes[i + 9] << 8);
      
      const fnameStart = i + 30;
      const fname = decoder.decode(bytes.slice(fnameStart, fnameStart + fnameLen));
      const dataStart = fnameStart + fnameLen + extraLen;
      
      // Only process uncompressed XML files (slides, document body)
      const isRelevant = ext === "pptx"
        ? fname.startsWith("ppt/slides/slide") && fname.endsWith(".xml")
        : fname === "word/document.xml";
        
      if (isRelevant && compMethod === 0 && compSize > 0) {
        const xmlContent = decoder.decode(bytes.slice(dataStart, dataStart + compSize));
        // Strip XML tags and get text
        const textOnly = xmlContent.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (textOnly.length > 5) texts.push(textOnly);
      }
    }
  }
  
  return texts.join("\n\n").slice(0, 30000);
}
