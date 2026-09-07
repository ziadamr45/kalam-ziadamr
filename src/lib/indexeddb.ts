/**
 * التخزين المحلي للقراءة دون اتصال — IndexedDB عبر idb-keyval
 * يخزن snapshot كاملًا لكل مقال محفوظ ليعمل الموقع دون إنترنت (PWA).
 */
import { createStore, get, set, del, entries } from "idb-keyval";
import type { OfflineArticle } from "@/types/offline";

const store =
  typeof window !== "undefined"
    ? createStore("kalam-offline", "articles")
    : undefined;

export async function saveOfflineArticle(article: OfflineArticle): Promise<void> {
  if (!store) return;
  await set(article.id, { ...article, savedAt: Date.now() }, store);
}

export async function getOfflineArticles(): Promise<OfflineArticle[]> {
  if (!store) return [];
  const all = await entries<string, OfflineArticle & { savedAt: number }>(store);
  return all
    .map(([, value]) => value)
    .sort((a, b) => b.savedAt - a.savedAt);
}

export async function removeOfflineArticle(id: string): Promise<void> {
  if (!store) return;
  await del(id, store);
}

export async function isArticleSaved(id: string): Promise<boolean> {
  if (!store) return false;
  const value = await get(id, store);
  return Boolean(value);
}
