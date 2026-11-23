import { blockPlainWords, parseBlocks } from "./content-blocks";

/** Search previews use visible words, never raw content markup. */
export function buildSearchSnippet(content: string, query: string): string | null {
  const q = query.trim();
  if (!q) return null;
  const plain = parseBlocks(content).flatMap(blockPlainWords).join(" ");
  const at = plain.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return null;
  const from = Math.max(0, at - 60);
  const end = Math.min(plain.length, at + q.length + 90);
  return `${from > 0 ? "…" : ""}${plain.slice(from, end).trim()}${end < plain.length ? "…" : ""}`;
}
