import express, { type Request } from "express";
import path from "path";
import dotenv from "dotenv";
import { applyResearch, citationSchemaProperties, localResearch, researchArticle, researchInstructions } from "./src/server/articleResearch";
import { GoogleGenAI, Type } from "@google/genai";
import {
  generateArticleLocally,
  refineArticleLocally,
  adaptVoiceLocally,
  adaptVoiceFromCorpusLocally,
  revoiceArticleLocally,
  generateDilemmasLocally,
  submitDilemmaLocally,
} from "./src/server/localArticle";
import type {
  ArticleDraftSnapshot,
  ArticleLength,
  ArticleTone,
  MediumArticle,
  VoiceDilemma,
  VoiceProfile,
} from "./src/types";

dotenv.config();

export const app = express();
const PORT = Number(process.env.PORT) || 3000;
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash";
const TRANSCRIPTION_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-2.5-flash";

app.use(express.json({ limit: "30mb" }));
app.use(express.urlencoded({ extended: true, limit: "30mb" }));
app.use("/api", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Lazy GoogleGenAI client
function getServerApiKey(): string | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;
  return apiKey;
}

function getApiKey(req?: Request): string | null {
  const sessionHeader = req?.get("x-gemini-api-key");
  if (sessionHeader !== undefined) {
    const sessionKey = sessionHeader.trim();
    return sessionKey.length >= 10 && sessionKey.length <= 256 && !/\s/.test(sessionKey)
      ? sessionKey
      : null;
  }
  return getServerApiKey();
}

function getGenAI(req?: Request): GoogleGenAI {
  const apiKey = getApiKey(req);
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
app.get("/api/health", (req, res) => {
  const sessionKeyPresent = Boolean(req.get("x-gemini-api-key"));
  const aiConfigured = Boolean(getApiKey(req));
  res.json({
    status: "ok",
    aiConfigured,
    serverKeyConfigured: Boolean(getServerApiKey()),
    keySource: sessionKeyPresent ? "session" : getServerApiKey() ? "server" : "none",
    generationMode: aiConfigured ? "ai" : "local",
    textModel: aiConfigured ? TEXT_MODEL : null,
    transcriptionAvailable: aiConfigured,
  });
});

app.post("/api/test-key", async (req, res) => {
  try {
    if (!req.get("x-gemini-api-key")) {
      return res.status(400).json({ error: "Enter a Gemini API key first." });
    }
    const response = await getGenAI(req).models.generateContent({
      model: TEXT_MODEL,
      contents: "Reply with exactly: connected",
    });
    if (!response.text?.toLowerCase().includes("connected")) {
      throw new Error("Gemini returned an unexpected response.");
    }
    res.json({ connected: true, model: TEXT_MODEL });
  } catch (error: any) {
    console.error("Gemini connection test failed:", error?.message || error);
    res.status(401).json({
      error: "Gemini could not verify that key. Check the key and its API access, then try again.",
    });
  }
});

app.post("/api/analyze-voice", async (req, res) => {
  try {
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length < 2) {
      return res.status(400).json({ error: "Answer at least two voice questions to build your profile." });
    }
    if (!getApiKey(req)) {
      return res.status(401).json({ error: "Connect Gemini before building a voice profile." });
    }

    const safeAnswers = answers.slice(0, 25).map((item: any) => ({
      question: String(item?.question || "").slice(0, 300),
      answer: String(item?.answer || "").slice(0, 4_000),
    })).filter((item: { answer: string }) => item.answer.trim().length >= 3);

    if (safeAnswers.length < 2) {
      return res.status(400).json({ error: "Answer at least two questions or select options so Gemini can learn your voice." });
    }

    const response = await getGenAI(req).models.generateContent({
      model: TEXT_MODEL,
      contents: `You are an expert writing coach and ghostwriter. Build a reusable voice profile from the author's survey responses below.

The author answered questions that may include selected multiple-choice stylistic preferences, short single-sentence hot takes, advice, and open-ended voice samples.
Synthesize these inputs to infer HOW this person communicates:
- Cadence, pacing, and rhythm (e.g. staccato bursts, conversational, analytical flow)
- Directness, vulnerability, and use of humor (e.g. deadpan, sarcastic, witty, sincere, zero-BS)
- Vocabulary level, jargon comfort, and explicit clichés or buzzwords to avoid
- Signature rhetorical moves, opening hooks, and conclusion instincts
- Visual and structural preferences (e.g. lots of whitespace, punchy one-liners, bulleted takeaways)

The writingInstructions must give clear, actionable directives for another writer or AI to write future articles that sound unmistakably like this author.

SURVEY RESPONSES:
${JSON.stringify(safeAnswers, null, 2)}

Return only valid JSON matching the schema.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING, description: "A short memorable name for this writing voice" },
            summary: { type: Type.STRING, description: "Two-sentence description of the voice" },
            traits: { type: Type.ARRAY, items: { type: Type.STRING } },
            sentenceStyle: { type: Type.STRING },
            vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
            signatureMoves: { type: Type.ARRAY, items: { type: Type.STRING } },
            avoidances: { type: Type.ARRAY, items: { type: Type.STRING } },
            writingInstructions: { type: Type.STRING, description: "A detailed directive for writing new articles in this voice" },
          },
          required: ["name", "summary", "traits", "sentenceStyle", "vocabulary", "signatureMoves", "avoidances", "writingInstructions"],
        },
      },
    });

    res.json(JSON.parse(response.text || "{}"));
  } catch (error: any) {
    console.error("Voice analysis error:", error?.message || error);
    res.status(500).json({ error: "Gemini could not build the voice profile. Please try again." });
  }
});

// Audio transcription endpoint with multimodal Gemini fallback
app.post("/api/transcribe", async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: "Missing audioData in request." });
    }

    if (!getApiKey(req)) {
      return res.status(503).json({
        error: "Audio transcription needs a Gemini API key. Live browser dictation and typed notes still work without one.",
      });
    }

    const ai = getGenAI(req);
    // Clean base64 string if data URL prefix is included
    const base64Clean = audioData.includes("base64,")
      ? audioData.split("base64,")[1]
      : audioData;

    // Normalize MIME type (strip codecs parameter for Gemini compatibility, e.g. audio/webm;codecs=opus -> audio/webm)
    const rawMime = mimeType || "audio/webm";
    const effectiveMime = rawMime.split(";")[0].trim().toLowerCase() || "audio/webm";

    const promptText = "Please accurately transcribe this audio recording of someone brainstorming their ideas, thoughts, and concepts. Preserve all key thoughts, terminology, and natural phrasing without unnecessary pleasantries or hallucinations.";

    const contents = [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: effectiveMime,
              data: base64Clean,
            },
          },
          {
            text: promptText,
          },
        ],
      },
    ];

    let transcript = "";
    // Try primary transcription model first, then fallback to gemini-2.5-flash and TEXT_MODEL
    const modelsToTry = Array.from(new Set([TRANSCRIPTION_MODEL, "gemini-2.5-flash", TEXT_MODEL]));

    let lastError: any = null;
    for (const model of modelsToTry) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
        });
        transcript = response.text || "";
        if (transcript.trim()) {
          break;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Transcription attempt with model "${model}" failed:`, err?.message || err);
      }
    }

    if (!transcript.trim() && lastError) {
      throw lastError;
    }

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
      voiceProfile,
    } = req.body;

    if (!transcript || typeof transcript !== "string" || !transcript.trim()) {
      return res
        .status(400)
        .json({ error: "Please provide a transcript or brainstorm text." });
    }

    const validTones: ArticleTone[] = [
      "thought-leadership",
      "technical-deepdive",
      "personal-narrative",
      "pragmatic-guide",
      "opinionated",
    ];
    const validLengths: ArticleLength[] = ["short", "medium", "in-depth"];
    const safeTone: ArticleTone = validTones.includes(tone) ? tone : "thought-leadership";
    const safeLength: ArticleLength = validLengths.includes(readingLength) ? readingLength : "medium";
    const safeAudience = typeof targetAudience === "string"
      ? targetAudience.slice(0, 300)
      : "Curious professionals & creators";
    const safeInstructions = typeof customInstructions === "string"
      ? customInstructions.slice(0, 1_000)
      : "";

    if (!getApiKey(req)) {
      return res.json(generateArticleLocally(transcript, {
        tone: safeTone,
        targetAudience: safeAudience,
        readingLength: safeLength,
        customInstructions: safeInstructions,
      }));
    }

    const ai = getGenAI(req);

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

    const systemPrompt = `You are an elite literary ghostwriter and personal essayist dedicated entirely to capturing the author's authentic voice, human personality, and real perspective.
Your #1 priority is voice fidelity: make the piece read like a genuine, thoughtful person wrote it—NEVER like generic AI marketing copy or keyword-stuffed SEO text.

Core Mandates:
1. Authentic Human Cadence:
   - Match the author's conversational rhythms, vocabulary, tone, and worldview.
   - Vary sentence lengths naturally. Use crisp, punchy observations alongside substantive explanations.
   - If an Author Voice Profile is provided, its rules, signature moves, and avoidances STRICTLY override all default conventions.
2. ZERO AI Slop & Buzzwords (Strictly Banned):
   - Never use textbook AI transitions and clichés: "In today's fast-paced world", "delve into", "tapestry", "testament to", "game-changer", "it's worth noting", "furthermore", "moreover", "in conclusion", "beacon of hope", "revolutionize", "pivotal".
   - Never pad paragraphs with empty corporate hype, superficial rhetorical questions, or generic motivational summaries.
   - Absolutely NO keyword stuffing. Write for smart human minds, not search engine spiders.
3. Natural Story Structure:
   - Compelling Title and Subtitle that reflect the authentic core thesis.
   - Hook the reader immediately with the central conflict, personal reflection, or observation without throat-clearing fluff.
   - Use headings, blockquotes, or lists only where they organically clarify the flow—never as forced formulaic decoration.
4. Publication SEO & Metadata:
   - Populate the required JSON SEO fields cleanly in the background for indexing, but DO NOT allow keyword targeting to alter or compromise the natural, human prose of the story body.`;

    const safeVoiceProfile = voiceProfile && typeof voiceProfile === "object"
      ? JSON.stringify({
          name: String(voiceProfile.name || "").slice(0, 100),
          summary: String(voiceProfile.summary || "").slice(0, 1_000),
          traits: Array.isArray(voiceProfile.traits) ? voiceProfile.traits.slice(0, 12) : [],
          sentenceStyle: String(voiceProfile.sentenceStyle || "").slice(0, 1_000),
          vocabulary: Array.isArray(voiceProfile.vocabulary) ? voiceProfile.vocabulary.slice(0, 30) : [],
          signatureMoves: Array.isArray(voiceProfile.signatureMoves) ? voiceProfile.signatureMoves.slice(0, 12) : [],
          avoidances: Array.isArray(voiceProfile.avoidances) ? voiceProfile.avoidances.slice(0, 12) : [],
          writingInstructions: String(voiceProfile.writingInstructions || "").slice(0, 5_000),
        }, null, 2)
      : "";

    // Research is automatic: spoken facts and broad topics both benefit from sources.
    const research = await researchArticle(ai, TEXT_MODEL, transcript.trim());

    const userPrompt = `Transform the following spoken brainstorm into a published-quality Medium article:

RAW IDEAS / TRANSCRIPT:
"""
${transcript.trim()}
"""

STYLE & CONFIGURATION:
- Tone Style: ${toneGuides[safeTone]}
- Target Audience: ${safeAudience}
- Target Length: ${lengthGuides[safeLength]}
${safeInstructions ? `- Custom Creator Instructions: ${safeInstructions}` : ""}
${safeVoiceProfile ? `
AUTHOR VOICE PROFILE (HIGHEST PRIORITY):
${safeVoiceProfile}

Strict instruction: Emulate this author's exact cadence, humor, rhetorical moves, and avoidances. Strip any AI-sounding phrases. Write as this specific person speaks and thinks.` : ""}

${researchInstructions(research)}

Return the result strictly as a valid JSON object matching the requested schema.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
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
            ...citationSchemaProperties,
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
            "sourceSuggestions",
            "unresolvedClaims",
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ ...applyResearch(parsed, research), generationMode: "ai" });
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
    const { article, instruction, voiceProfile } = req.body;
    if (!article || !instruction) {
      return res.status(400).json({ error: "Missing article or instruction." });
    }

    if (typeof instruction !== "string" || instruction.length > 1_000) {
      return res.status(400).json({ error: "Refinement instructions must be under 1,000 characters." });
    }

    if (!getApiKey(req)) {
      return res.json({ ...refineArticleLocally(article, instruction), research: localResearch });
    }

    const ai = getGenAI(req);

    const research = await researchArticle(ai, TEXT_MODEL,
      `${article.sourceTranscript || ""}\n\n${article.title}\n${article.subtitle}\n${article.contentMarkdown}\n\nRequested revision: ${instruction}`);

    const prompt = `You are a master Medium editor and SEO expert.
Here is the current Medium article:
Title: ${article.title}
Subtitle: ${article.subtitle}
Content:
${article.contentMarkdown}

User's requested refinement:
"${instruction}"

${voiceProfile?.writingInstructions ? `Author voice instructions:\n${String(voiceProfile.writingInstructions).slice(0, 5_000)}\n` : ""}

Please update the article according to this request. Keep the structure, SEO tags, and flow coherent.
${researchInstructions(research)}
${research.research.status !== "complete" ? "Source search did not return new evidence. Preserve existing hyperlinks on unchanged claims and topics. Do not introduce new links." : ""}
Return updated content strictly as JSON.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
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
            ...citationSchemaProperties,
          },
          required: ["title", "subtitle", "contentMarkdown", "revisionSummary", "sourceSuggestions", "unresolvedClaims"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({ ...applyResearch(parsed, research, article), generationMode: "ai" });
  } catch (error: any) {
    console.error("Refine article error:", error);
    res.status(500).json({
      error: error?.message || "Failed to refine article.",
    });
  }
});

// Adapt / tune voice profile based on manual author edits
app.post("/api/adapt-voice-from-edits", async (req, res) => {
  try {
    const { original, edited, currentProfile, transcript } = req.body;
    if (!original || !edited) {
      return res.status(400).json({ error: "Missing original or edited article draft." });
    }

    const safeOriginal: ArticleDraftSnapshot = {
      title: String(original.title || "").slice(0, 300),
      subtitle: String(original.subtitle || "").slice(0, 500),
      contentMarkdown: String(original.contentMarkdown || "").slice(0, 50_000),
    };

    const safeEdited: ArticleDraftSnapshot = {
      title: String(edited.title || "").slice(0, 300),
      subtitle: String(edited.subtitle || "").slice(0, 500),
      contentMarkdown: String(edited.contentMarkdown || "").slice(0, 50_000),
    };

    // If local mode or Gemini key not available, adapt locally
    if (!getApiKey(req)) {
      return res.json(adaptVoiceLocally(safeOriginal, safeEdited, currentProfile));
    }

    const ai = getGenAI(req);

    const prompt = `You are a master writing voice coach and literary analyst.
The author was given an AI-generated draft of an article and made manual revisions to it.
Compare the original AI draft with the author's edited version to deduce the author's authentic voice, stylistic instincts, tone preferences, and rhetorical habits.

ORIGINAL AI DRAFT:
Title: ${safeOriginal.title}
Subtitle: ${safeOriginal.subtitle}
Content:
${safeOriginal.contentMarkdown}

AUTHOR'S EDITED VERSION:
Title: ${safeEdited.title}
Subtitle: ${safeEdited.subtitle}
Content:
${safeEdited.contentMarkdown}

${transcript ? `ORIGINAL SPOKEN TRANSCRIPT (for context):\n${String(transcript).slice(0, 5_000)}\n` : ""}
${currentProfile ? `CURRENT VOICE PROFILE:\n${JSON.stringify(currentProfile, null, 2)}\n` : ""}

YOUR TASK:
Analyze the differences between the original AI text and the author's edited version:
1. Vocabulary & phrasing: What specific words, colloquialisms, idioms, or technical nuances did the author introduce?
2. Avoidances & deletions: What words, phrases, corporate clichés, filler, or fluff did the author strip out or rewrite?
3. Sentence cadence & pacing: Did the author make sentences shorter and punchier? Or longer and more narrative/conversational? Describe the rhythm.
4. Tone & attitude: What is the author's true stance (e.g. blunt, witty, skeptical, pragmatic, warm, understated)?
5. Structure & formatting: Did the author use bullet points, short paragraphs, bold callouts, subheadings?
6. Actionable writing directives: Create clear, actionable rules for writing in this exact voice in the future.

Synthesize these findings into an updated Voice Profile. If a current voice profile exists, refine and enrich it. If no profile exists, create a complete new profile.
Provide a concise adaptationSummary (1-2 sentences) describing what changed in the voice profile based on these edits.
Return valid JSON matching the schema.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            profile: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: "Name of the voice profile" },
                summary: { type: Type.STRING, description: "Two-sentence summary of the voice" },
                traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                sentenceStyle: { type: Type.STRING, description: "Sentence cadence and rhythm" },
                vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
                signatureMoves: { type: Type.ARRAY, items: { type: Type.STRING } },
                avoidances: { type: Type.ARRAY, items: { type: Type.STRING } },
                writingInstructions: { type: Type.STRING, description: "Comprehensive directives for writing articles in this voice" },
              },
              required: [
                "name",
                "summary",
                "traits",
                "sentenceStyle",
                "vocabulary",
                "signatureMoves",
                "avoidances",
                "writingInstructions",
              ],
            },
            adaptationSummary: {
              type: Type.STRING,
              description: "A 1-2 sentence summary of how the voice adjusted to the author's edits",
            },
          },
          required: ["profile", "adaptationSummary"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const adaptationSummary = parsed.adaptationSummary || "Updated voice profile from your story edits.";
    const profile = parsed.profile || {};

    const adaptationNotes = [
      ...(currentProfile?.adaptationNotes || []),
      `${new Date().toLocaleDateString()}: ${adaptationSummary}`,
    ].slice(-10);

    const fullProfile: VoiceProfile = {
      name: profile.name || currentProfile?.name || "My Voice",
      summary: profile.summary || currentProfile?.summary || "Learned voice profile.",
      traits: Array.isArray(profile.traits) ? profile.traits : (currentProfile?.traits || []),
      sentenceStyle: profile.sentenceStyle || currentProfile?.sentenceStyle || "",
      vocabulary: Array.isArray(profile.vocabulary) ? profile.vocabulary : (currentProfile?.vocabulary || []),
      signatureMoves: Array.isArray(profile.signatureMoves) ? profile.signatureMoves : (currentProfile?.signatureMoves || []),
      avoidances: Array.isArray(profile.avoidances) ? profile.avoidances : (currentProfile?.avoidances || []),
      writingInstructions: profile.writingInstructions || currentProfile?.writingInstructions || "",
      interviewAnswers: currentProfile?.interviewAnswers || [],
      updatedAt: new Date().toISOString(),
      adaptationNotes,
    };

    res.json({
      profile: fullProfile,
      adaptationSummary,
    });
  } catch (error: any) {
    console.error("Voice adaptation error:", error);
    try {
      const fallback = adaptVoiceLocally(req.body.original, req.body.edited, req.body.currentProfile);
      return res.json(fallback);
    } catch {
      res.status(500).json({ error: error?.message || "Failed to adjust voice from edits." });
    }
  }
});

// Adapt / calibrate voice profile across all published articles compared to their initial AI drafts
app.post("/api/adapt-voice-from-corpus", async (req, res) => {
  try {
    const { pairs, currentProfile } = req.body;
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return res.status(400).json({ error: "Please provide an array of published and original draft pairs." });
    }

    if (!getApiKey(req)) {
      return res.json(adaptVoiceFromCorpusLocally(pairs, currentProfile));
    }

    const ai = getGenAI(req);

    const corpusSummary = pairs.map((pair, idx) => `
--- ARTICLE PAIR #${idx + 1}: "${pair.title || pair.published?.title || `Story ${idx + 1}`}" ---
[INITIAL AI DRAFT THAT WAS PRESENTED]:
Title: ${pair.original?.title || "Untitled"}
Subtitle: ${pair.original?.subtitle || ""}
Content:
${String(pair.original?.contentMarkdown || "").slice(0, 10_000)}

[FINAL PUBLISHED VERSION]:
Title: ${pair.published?.title || "Untitled"}
Subtitle: ${pair.published?.subtitle || ""}
Content:
${String(pair.published?.contentMarkdown || "").slice(0, 10_000)}
`).join("\n");

    const prompt = `You are a master literary analyst and personal voice profiler.
Below is the author's published archive. For each story, you are given the INITIAL AI DRAFT that was originally presented to the author, alongside the FINAL PUBLISHED VERSION that the author actually published.

Do NOT evaluate raw speech-to-text dictation. Evaluate the DELTA between what the AI wrote and what the author chose to publish.

${corpusSummary}

${currentProfile ? `CURRENT VOICE PROFILE:\n${JSON.stringify(currentProfile, null, 2)}\n` : ""}

YOUR TASK:
Synthesize an authoritative, nuanced Voice Profile from this corpus of edits:
1. Cut-List / Anti-Patterns: What AI words, clichés, corporate buzzwords, and filler transitions did the author systematically strike out across these stories? (e.g. "delve", "testament", forced subheadings, generic introductions).
2. True Cadence & Sentence Rhythm: How does the author structure sentences? (Sentence length variance, punchy fragments, conversational flow, punctuation habits).
3. Tone, Attitude & Humor: Is the author candid, dry, self-deprecating, pragmatic, witty, blunt? How do they open and conclude pieces?
4. Signature Vocabulary & Moves: What specific phrases, everyday analogies, or structural patterns appear in their published versions?
5. Directives for Future AI Writing: Clear, enforceable rules so that future drafts sound 100% like this human author and 0% like generic AI.

Provide a concise 1-2 sentence adaptationSummary. Return valid JSON matching the schema.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            profile: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                summary: { type: Type.STRING },
                traits: { type: Type.ARRAY, items: { type: Type.STRING } },
                sentenceStyle: { type: Type.STRING },
                vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } },
                signatureMoves: { type: Type.ARRAY, items: { type: Type.STRING } },
                avoidances: { type: Type.ARRAY, items: { type: Type.STRING } },
                bannedWordsAndPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
                writingInstructions: { type: Type.STRING },
              },
              required: [
                "name", "summary", "traits", "sentenceStyle", "vocabulary",
                "signatureMoves", "avoidances", "writingInstructions",
              ],
            },
            adaptationSummary: { type: Type.STRING },
          },
          required: ["profile", "adaptationSummary"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const adaptationSummary = parsed.adaptationSummary || `Calibrated voice across ${pairs.length} published stories.`;
    const profile = parsed.profile || {};

    const adaptationNotes = [
      ...(currentProfile?.adaptationNotes || []),
      `${new Date().toLocaleDateString()}: ${adaptationSummary}`,
    ].slice(-10);

    const fullProfile: VoiceProfile = {
      name: profile.name || currentProfile?.name || "My Calibrated Voice",
      summary: profile.summary || currentProfile?.summary || `Voice calibrated from ${pairs.length} published stories.`,
      traits: Array.isArray(profile.traits) ? profile.traits : (currentProfile?.traits || []),
      sentenceStyle: profile.sentenceStyle || currentProfile?.sentenceStyle || "",
      vocabulary: Array.isArray(profile.vocabulary) ? profile.vocabulary : (currentProfile?.vocabulary || []),
      signatureMoves: Array.isArray(profile.signatureMoves) ? profile.signatureMoves : (currentProfile?.signatureMoves || []),
      avoidances: Array.isArray(profile.avoidances) ? profile.avoidances : (currentProfile?.avoidances || []),
      bannedWordsAndPhrases: Array.isArray(profile.bannedWordsAndPhrases) ? profile.bannedWordsAndPhrases : (currentProfile?.bannedWordsAndPhrases || []),
      writingInstructions: profile.writingInstructions || currentProfile?.writingInstructions || "",
      interviewAnswers: currentProfile?.interviewAnswers || [],
      updatedAt: new Date().toISOString(),
      adaptationNotes,
      corpusArticleCount: pairs.length,
    };

    res.json({
      profile: fullProfile,
      adaptationSummary,
    });
  } catch (error: any) {
    console.error("Corpus voice adaptation error:", error);
    try {
      const fallback = adaptVoiceFromCorpusLocally(req.body.pairs, req.body.currentProfile);
      return res.json(fallback);
    } catch {
      res.status(500).json({ error: error?.message || "Failed to adapt voice from published corpus." });
    }
  }
});

// Re-voice and de-slop the current article draft using the calibrated voice profile
app.post("/api/revoice-article", async (req, res) => {
  try {
    const { article, voiceProfile, customInstructions = "" } = req.body;
    if (!article || !article.contentMarkdown) {
      return res.status(400).json({ error: "Please provide an article to re-voice." });
    }

    if (!getApiKey(req)) {
      return res.json(revoiceArticleLocally(article, voiceProfile));
    }

    const ai = getGenAI(req);

    const prompt = `You are a master literary editor and ghostwriter.
The user is providing an article draft that currently sounds overly AI-generated, full of generic buzzwords, robotic transitions, and forced keyword stuffing.
Your job is to RE-VOICE and DE-SLOP this article into the author's authentic personal human voice.

CURRENT DRAFT:
Title: ${article.title}
Subtitle: ${article.subtitle}
Content:
${article.contentMarkdown}

${voiceProfile ? `AUTHOR'S CALIBRATED VOICE PROFILE (MANDATORY TO FOLLOW):
${JSON.stringify(voiceProfile, null, 2)}` : ""}

${customInstructions ? `AUTHOR'S SPECIFIC INSTRUCTIONS:\n${customInstructions}` : ""}

STRICT RULES:
1. Strip all AI clichés ("delve", "testament", "tapestry", "game-changer", "in today's fast-paced world", "furthermore", "in conclusion", "it's worth noting").
2. Remove random keyword-stuffing and artificial transitions.
3. Keep the core arguments, structure, and points, but rewrite the sentences to match the author's natural cadence and rhythm.
4. If an Author Voice Profile is provided, use their signature vocabulary, sentence pacing, and respect all their avoidances.
5. Return valid JSON matching the schema.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subtitle: { type: Type.STRING },
            contentMarkdown: { type: Type.STRING },
            revisionSummary: { type: Type.STRING },
          },
          required: ["title", "subtitle", "contentMarkdown", "revisionSummary"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json({
      title: parsed.title || article.title,
      subtitle: parsed.subtitle || article.subtitle,
      contentMarkdown: parsed.contentMarkdown || article.contentMarkdown,
      revisionSummary: parsed.revisionSummary || "Re-voiced story in your authentic calibrated style.",
    });
  } catch (error: any) {
    console.error("Re-voice article error:", error);
    try {
      const fallback = revoiceArticleLocally(req.body.article, req.body.voiceProfile);
      return res.json(fallback);
    } catch {
      res.status(500).json({ error: error?.message || "Failed to re-voice article." });
    }
  }
});

// Generate interactive voice calibration dilemmas (Would you say this or that?)
app.post("/api/generate-voice-dilemmas", async (req, res) => {
  try {
    const { article, voiceProfile } = req.body;
    if (!getApiKey(req)) {
      return res.json({ dilemmas: generateDilemmasLocally(article, voiceProfile) });
    }

    const ai = getGenAI(req);

    const prompt = `You are a voice coach helping a writer calibrate their authentic writing style through pairwise A/B choices.
Generate 4 sharp, distinct "Would you say this or that?" dilemmas tailored to this writer:
${article ? `Context from their active story ("${article.title}"):\n${article.contentMarkdown.slice(0, 3000)}` : "General writing scenarios (opening hook, transition, admitting a mistake, strong opinion, concluding)."}
${voiceProfile ? `Current Voice Profile:\n${JSON.stringify(voiceProfile, null, 2)}` : ""}

For each dilemma:
- id: A short unique identifier (e.g. "dilemma-1")
- category: One of "opening", "transition", "humor", "opinion", "cadence", "conclusion", "clarity"
- scenario: A realistic writing moment (e.g., "Hooking the reader on an unexpected failure", "Transitioning to a hard counterpoint", "Explaining a technical trade-off").
- optionA: A standard, formal, or slightly AI-sounding phrasing.
- optionB: A punchy, authentic, candid, or conversational human phrasing.
- labelA: 2-3 words describing option A (e.g. "Formal & Safe").
- labelB: 2-3 words describing option B (e.g. "Candid & Punchy").

Return JSON matching the schema.`;

    const response = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            dilemmas: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  category: { type: Type.STRING },
                  scenario: { type: Type.STRING },
                  optionA: { type: Type.STRING },
                  optionB: { type: Type.STRING },
                  labelA: { type: Type.STRING },
                  labelB: { type: Type.STRING },
                },
                required: ["id", "category", "scenario", "optionA", "optionB"],
              },
            },
          },
          required: ["dilemmas"],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}");
    const dilemmas = Array.isArray(parsed.dilemmas) && parsed.dilemmas.length > 0
      ? parsed.dilemmas
      : generateDilemmasLocally(article, voiceProfile);

    res.json({ dilemmas });
  } catch (error) {
    console.warn("Failed to generate dilemmas with AI, using local fallback:", error);
    res.json({ dilemmas: generateDilemmasLocally(req.body.article, req.body.voiceProfile) });
  }
});

// Submit a voice dilemma choice to calibrate the voice profile
app.post("/api/submit-voice-dilemma", async (req, res) => {
  try {
    const { dilemma, choice, customText, voiceProfile } = req.body;
    if (!dilemma || !choice) {
      return res.status(400).json({ error: "Missing dilemma or choice." });
    }

    const result = submitDilemmaLocally(dilemma, choice, customText, voiceProfile);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to submit voice calibration." });
  }
});

// Vite / static server integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist", "client");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

// Cloudflare imports this Express app and supplies its own HTTP server bridge.
if (process.env.NODE_ENV !== "test" && !(globalThis as any).WebSocketPair) {
  startServer();
}
