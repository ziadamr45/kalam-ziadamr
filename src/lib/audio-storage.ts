/** Opt-in identity for replaced recordings. Omit revision to preserve legacy storage. */
export function audioStorageKeys(slug: string, src: string, revision?: string) {
  if (!revision) return {
    audio: `kalam-audio:${slug}`,
    position: `kalam-audio-pos:${slug}`,
  };
  const identity = [slug, revision, src].map(encodeURIComponent).join(":");
  return {
    audio: `kalam-audio-v2:${identity}`,
    position: `kalam-audio-pos-v2:${identity}`,
  };
}

/** One-article rollout. Other articles keep their existing cache/resume behavior. */
export function articleAudioRevision(articleId: string, generatedAt: Date | null): string | undefined {
  if (articleId !== "cmve6n9kf0001l607sstryfn0") return undefined;
  return generatedAt?.toISOString() ?? "recording-aware-v1";
}
