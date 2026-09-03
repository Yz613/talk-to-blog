import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));

// Lazy GoogleGenAI client
function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in environment.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Health check endpoint
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    hasApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Audio transcription endpoint using gemini-3.5-transcribe
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData in request." });
    }

    const ai = getGenAI();
    // Clean base64 string if data URL prefix is included
    const base64Clean = audioData.includes("base64,")
      ? audioData.split("base64,")[1]
      : audioData;

    const effectiveMime = mimeType || "audio/webm";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: effectiveMime,
              data: base64Clean,
            },
          },
          {
            text: "Please accurately transcribe this audio recording of someone brainstorming their ideas, thoughts, and concepts. Preserve all key thoughts, terminology, and natural phrasing without unnecessary pleasantries or hallucinations.",
          },
        ],
      },
    });

    const transcript = response.text || "";
    res.json({ transcript: transcript.trim() });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({
      error: error?.message || "Failed to transcribe audio recording.",
    });
  }
});

// Generate complete Medium article with SEO & Tags
app.post("/api/generate-article", async (req, res) => {
  try {
    const {
      transcript,
      tone = "thought-leadership",
      targetAudience = "Curious professionals & creators",
      readingLength = "medium",
      customInstructions = "",
    } = req.body;

    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return res
        .status(400)
        .json({ error: "Please provide a transcript or brainstorm text." });
    }

    const ai = getGenAI();

    const toneGuides: Record<string, string> = {
      "thought-leadership":
        "Compelling, visionary, authoritative yet conversational Medium thought-leader style. Strong hooks, memorable analogies, and forward-looking conclusions.",
      "technical-deepdive":
        "Pragmatic, developer-friendly, concrete technical breakdown with code blocks/architecture patterns where relevant, clean explanations, and practical nuances.",
      "personal-narrative":
        "First-person relatable storytelling, authentic reflection, vulnerable lessons learned, visceral anecdotes, and universal takeaways.",
      "pragmatic-guide":
        "Action-oriented, highly skimmable step-by-step framework, bulleted blueprints, actionable strategies, and quick-win checklists.",
      opinionated:
        "Contrarian, provocative, punchy and persuasive. Challenges industry status-quo with sharp rhetoric, backed by reasoning and candid observations.",
    };

    const lengthGuides: Record<string, string> = {
      short: "Approx 800 - 1,100 words (3-4 min read on Medium). Snappy, concise, high punch-rate.",
      medium: "Approx 1,400 - 1,800 words (5-7 min read on Medium). Well-developed arguments, vivid examples, balanced pacing.",
      "in-depth": "Approx 2,200 - 2,800 words (8-10 min read on Medium). Exhaustive masterclass, rich multi-part exploration.",
    };

    const systemPrompt = `You are a world-class viral Medium author, top publication editor, and veteran digital SEO strategist.
Your task is to take raw, spoken voice notes, unstructured brainstorms, or rough ideas and turn them into a pristine, high-performing Medium publication article.

Core Rules:
1. Style: Follow Medium's signature aesthetic:
   - Magnetic, high-CTR Title and a crisp Subtitle (Medium kicker/subheading).
   - A captivating introductory hook that hooks the reader within the first 10 seconds.
   - Elegant structural rhythm with clear H2 and H3 subheadings.
   - Pull quotes (blockquotes) for key epiphanies.
   - Bulleted breakdowns, bolded concepts for effortless scanning.
   - A strong, memorable conclusion with a thoughtful takeaway and reader discussion prompt.
2. SEO Optimization:
   - High search intent alignment for Google and Medium internal search.
   - Compelling Meta Title (under 60 chars) and Meta Description (140-160 chars).
   - Clean SEO Slug.
   - Primary Focus Keyword and 5 high-impact secondary keywords.
   - Real SEO health score (0-100) based on title optimization, keyword density, heading distribution, and readability.
   - Clear SEO recommendations for ranking.
3. Tags:
   - Medium strictly allows exactly 5 tags per story. Provide the 5 best high-traffic, relevant Medium tags.
   - Also provide 5 alternative/niche tags that could be swapped in.
   - Include rationale for why each primary tag was chosen.`;

    const userPrompt = `Transform the following spoken brainstorm into a published-quality Medium article:

RAW IDEAS / TRANSCRIPT:
"""
${transcript.trim()}
"""

STYLE & CONFIGURATION:
- Tone Style: ${toneGuides[tone] || toneGuides["thought-leadership"]}
- Target Audience: ${targetAudience}
- Target Length: ${lengthGuides[readingLength] || lengthGuides["medium"]}
${customInstructions ? `- Custom Creator Instructions: ${customInstructions}` : ""}

Return the result strictly as a valid JSON object matching the requested schema.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "The primary Medium story title",
            },
            subtitle: {
              type: Type.STRING,
              description: "The Medium subtitle / kicker",
            },
            alternativeTitles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "2-3 alternative compelling title options",
            },
            readTimeMinutes: {
              type: Type.INTEGER,
              description: "Estimated reading time in minutes",
            },
            wordCount: {
              type: Type.INTEGER,
              description: "Estimated total word count",
            },
            contentMarkdown: {
              type: Type.STRING,
              description:
                "The complete article body in rich Markdown (including ## and ### headings, > blockquotes, lists, bold text, etc.)",
            },
            executiveSummary: {
              type: Type.STRING,
              description:
                "A 2-3 sentence executive synopsis of the story's main argument",
            },
            seo: {
              type: Type.OBJECT,
              properties: {
                seoTitle: {
                  type: Type.STRING,
                  description: "Google SEO optimized title (< 60 chars)",
                },
                metaDescription: {
                  type: Type.STRING,
                  description: "Meta description for search engines (140-160 chars)",
                },
                slug: {
                  type: Type.STRING,
                  description: "URL slug, e.g. how-to-scale-voice-ai-apps",
                },
                primaryKeyword: {
                  type: Type.STRING,
                  description: "Main target keyword",
                },
                secondaryKeywords: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "4-6 supporting LSI keywords",
                },
                searchIntent: {
                  type: Type.STRING,
                  description:
                    "Search intent e.g. Informational, Thought Leadership, How-to Guide",
                },
                seoScore: {
                  type: Type.INTEGER,
                  description: "SEO optimization score from 0 to 100",
                },
                seoHealthBreakdown: {
                  type: Type.OBJECT,
                  properties: {
                    titleOptimization: {
                      type: Type.STRING,
                      description: "Assessment of title length and power words",
                    },
                    contentDepth: {
                      type: Type.STRING,
                      description: "Assessment of topic coverage and structural hierarchy",
                    },
                    readability: {
                      type: Type.STRING,
                      description: "Assessment of sentence variation and skimmability",
                    },
                  },
                },
                seoTips: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description:
                    "3-4 actionable tips to improve organic search & Medium ranking",
                },
              },
              required: [
                "seoTitle",
                "metaDescription",
                "slug",
                "primaryKeyword",
                "secondaryKeywords",
                "searchIntent",
                "seoScore",
                "seoTips",
              ],
            },
            tags: {
              type: Type.OBJECT,
              properties: {
                primaryMediumTags: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      tag: { type: Type.STRING },
                      popularity: {
                        type: Type.STRING,
                        description: "e.g. Very High, High, Medium, Niche",
                      },
                      relevanceReason: { type: Type.STRING },
                    },
                    required: ["tag", "popularity", "relevanceReason"],
                  },
                  description: "The top 5 Medium tags for publishing",
                },
                alternativeTags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "5 alternative tags to swap in",
                },
              },
              required: ["primaryMediumTags", "alternativeTags"],
            },
            suggestedPublications: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description:
                "2-3 top Medium publications that would accept this story (e.g. Towards Data Science, Better Humans, The Startup)",
            },
          },
          required: [
            "title",
            "subtitle",
            "alternativeTitles",
            "readTimeMinutes",
            "wordCount",
            "contentMarkdown",
            "executiveSummary",
            "seo",
            "tags",
            "suggestedPublications",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Generate article error:", error);
    res.status(500).json({
      error: error?.message || "Failed to generate article from ideas.",
    });
  }
});

// Refine or tweak generated article
app.post("/api/refine-article", async (req, res) => {
  try {
    const { article, instruction } = req.body;
    if (!article || !instruction) {
      return res.status(400).json({ error: "Missing article or instruction." });
    }

    const ai = getGenAI();

    const prompt = `You are a master Medium editor and SEO expert.
Here is the current Medium article:
Title: ${article.title}
Subtitle: ${article.subtitle}
Content:
${article.contentMarkdown}

User's requested refinement:
"${instruction}"

Please update the article according to this request. Keep the structure, SEO tags, and flow coherent.
Return updated content strictly as JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            contentMarkdown: { type: Type.STRING },
            revisionSummary: {
              type: Type.STRING,
              description: "Brief note of what was improved",
            },
            updatedSeoScore: { type: Type.INTEGER },
          },
          required: ["title", "subtitle", "contentMarkdown", "revisionSummary"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("Refine article error:", error);
    res.status(500).json({
      error: error?.message || "Failed to refine article.",
    });
  }
});

// Vite / static server integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
