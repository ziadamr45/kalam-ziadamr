export type OfflineArticle = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  contentWithTashkeel: string;
  sectionName?: string | null;
  sectionSlug?: string | null;
  readingTimeSec: number;
  audioUrl?: string | null;
  savedAt?: number;
};
