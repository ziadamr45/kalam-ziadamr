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

/** Every article gets a recording-scoped identity: without it the legacy slug-only
    cache key keeps replaying the previous recording from IndexedDB after a
    replacement, because resolveSrc prefers any stored blob over the new src. */
export function articleAudioRevision(_articleId: string, generatedAt: Date | null): string | undefined {
  return generatedAt?.toISOString() ?? "recording-aware-v1";
}
