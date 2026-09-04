export interface TagItem {
  tag: string;
  popularity: string;
  relevanceReason: string;
}

export interface SeoHealthBreakdown {
  titleOptimization?: string;
  contentDepth?: string;
  readability?: string;
}

export interface ArticleSeo {
  seoTitle: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  searchIntent: string;
  seoScore: number;
  seoHealthBreakdown?: SeoHealthBreakdown;
  seoTips: string[];
}

export interface ArticleTags {
  primaryMediumTags: TagItem[];
  alternativeTags: string[];
}

export interface ArticleDraftSnapshot {
  title: string;
  subtitle: string;
  contentMarkdown: string;
}

export interface MediumArticle {
  id: string;
  title: string;
  subtitle: string;
  alternativeTitles: string[];
  readTimeMinutes: number;
  wordCount: number;
  contentMarkdown: string;
  executiveSummary: string;
  seo: ArticleSeo;
  tags: ArticleTags;
  suggestedPublications: string[];
  createdAt: string;
  sourceTranscript: string;
  tone: string;
  generationMode?: 'ai' | 'local';
  initialAiDraft?: ArticleDraftSnapshot;
  lastVoiceSyncAt?: string;
}

export type ArticleTone =
  | 'thought-leadership'
  | 'technical-deepdive'
  | 'personal-narrative'
  | 'pragmatic-guide'
  | 'opinionated';

export type ArticleLength = 'short' | 'medium' | 'in-depth';

export interface GenerationOptions {
  tone: ArticleTone;
  targetAudience: string;
  readingLength: ArticleLength;
  customInstructions: string;
}

export interface VoiceInterviewAnswer {
  question: string;
  answer: string;
}

export interface VoiceProfile {
  name: string;
  summary: string;
  traits: string[];
  sentenceStyle: string;
  vocabulary: string[];
  signatureMoves: string[];
  avoidances: string[];
  writingInstructions: string;
  interviewAnswers: VoiceInterviewAnswer[];
  updatedAt: string;
  adaptationNotes?: string[];
}

