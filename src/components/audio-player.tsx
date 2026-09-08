"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { get, set } from "idb-keyval";
import { easternDigits } from "@/lib/utils";

type Cue = { t: number; id: string };
type BlockMeta = { id: string; words: number };
type WordTiming = { w: string; s: number; e: number };

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${easternDigits(m)}:${easternDigits(String(s).padStart(2, "0"))}`;
}

/**
 * المشغل الصوتي الكاريوكي — قراءة الصوت مع تظليل الكلمة المقروءة لحظيًا،
 * تمرير تلقائي يبقي الفقرة في منتصف الشاشة، ونقر أي كلمة يقفز بها الصوت إليها.
 *
 * - وضع الكلمات: مصفوفة audioWords [{w,s,e}] المولّدة بالذكاء الاصطناعي.
 * - وضع الفقرات: audioCues اليدوية أو توزيع تناسبي (توافقية رفع يدوي).
 * - Media Session: تحكم الشاشة المقفلة والخلفية على الهواتف.
 * - كاش محلي (IndexedDB): الزائر المتكرر لا يعيد تحميل الصوت إطلاقًا.
 */
export function AudioPlayer({
  src,
  durationSec,
  cues,
  blocks,
  words,
  slug,
  syncKey,
  title,
  sectionName,
  coverImage,
}: {
  src: string;
  durationSec: number | null;
  cues: Cue[] | null;
  blocks: BlockMeta[];
  words?: WordTiming[] | null;
  slug: string;
  syncKey?: string;
  title?: string;
  sectionName?: string | null;
  coverImage?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  /* جلسة صوتية نشطة (بدأ التشغيل ولم ينتهِ) — تحكم ظهور الكبسولة العائمة */
  const [sessionActive, setSessionActive] = useState(false);

  /* بث حالة الكبسولة للعناصر العائمة الأخرى — زر العودة للأعلى يرتفع فوقها تلقائيًا */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("kalam:audio-capsule", { detail: { active: sessionActive } }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent("kalam:audio-capsule", { detail: { active: false } }));
    };
  }, [sessionActive]);

  const wordElsRef = useRef<Map<number, Element> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cachedRef = useRef(false);
  const activeWordRef = useRef<number>(-1);

  const wordList = useMemo(
    () => (words && words.length > 0 ? [...words].sort((a, b) => a.s - b.s) : null),
    [words],
  );

  /* ==================== كاش الصوت المحلي (IndexedDB) ==================== */

  const resolveSrc = useCallback(async (): Promise<string> => {
    try {
      const blob = (await get(`kalam-audio:${slug}`)) as Blob | undefined;
      if (blob && blob.size > 0) {
        cachedRef.current = true;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        return url;
      }
    } catch {}
    return src;
  }, [slug, src]);

  const cacheAudio = useCallback(async () => {
    if (cachedRef.current) return;
    try {
      cachedRef.current = true;
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) return;
      const blob = await res.blob();
      if (blob.size > 0 && blob.size < 40 * 1024 * 1024) {
        await set(`kalam-audio:${slug}`, blob);
      }
    } catch {}
  }, [slug, src]);

  /* ==================== عناصر الكلمات (إعادة بناء عند تبديل التشكيل) ==================== */

  useEffect(() => {
    wordElsRef.current = null;
    activeWordRef.current = -1;
    return () => {
      wordElsRef.current = null;
    };
  }, [syncKey]);

  const wordElements = useCallback((): Map<number, Element> => {
    if (!wordElsRef.current) {
      const map = new Map<number, Element>();
      try {
        document.querySelectorAll("#article-body span[data-wi]").forEach((el) => {
          const wi = Number((el as HTMLElement).dataset.wi);
          if (!Number.isNaN(wi)) map.set(wi, el);
        });
      } catch {}
      wordElsRef.current = map;
    }
    return wordElsRef.current;
  }, []);

  /* ==================== إبراز الكلمة الحالية + التمرير الانسيابي ==================== */

  const setActiveWord = useCallback(
    (idx: number) => {
      const prev = activeWordRef.current;
      if (prev === idx) return;
      const els = wordElements();

      if (prev >= 0) {
        els.get(prev)?.classList.remove("audio-word-active");
        els.get(prev)?.closest("[id^='blk-']")?.classList.remove("audio-active");
      }
      activeWordRef.current = idx;

      const el = idx >= 0 ? els.get(idx) : null;
      if (el) {
        el.classList.add("audio-word-active");
        const blockEl = el.closest("[id^='blk-']");
        blockEl?.classList.add("audio-active");

        /* تمرير تلقائي هادئ: يتحرك فقط حين تخرج الكلمة من النطاق المريح */
        if (follow) {
          const rect = el.getBoundingClientRect();
          const topBand = window.innerHeight * 0.22;
          const bottomBand = window.innerHeight * 0.78;
          if (rect.top < topBand || rect.bottom > bottomBand) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      } else if (idx < 0) {
        document.querySelectorAll(".audio-word-active").forEach((n) => n.classList.remove("audio-word-active"));
        document.querySelectorAll("#article-body .audio-active").forEach((n) => n.classList.remove("audio-active"));
      }
    },
    [follow, wordElements],
  );

  /** البحث الثنائي عن الكلمة المقروءة الآن */
  const activeWordIndex = useCallback(
    (t: number): number => {
      if (!wordList) return -1;
      let lo = 0;
      let hi = wordList.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const w = wordList[mid];
        if (t < w.s) hi = mid - 1;
        else if (t > w.e) lo = mid + 1;
        else {
          found = mid;
          break;
        }
      }
      if (found === -1 && lo > 0 && lo <= wordList.length) found = lo - 1;
      return found;
    },
    [wordList],
  );

  /* ==================== وضع الفقرات (توافقية الرفع اليدوي) ==================== */

  const timings = useMemo(() => {
    const totalWords = blocks.reduce((a, b) => a + b.words, 0) || 1;
    const dur = duration || durationSec || 0;
    const map = new Map<string, number>();
    if (cues && cues.length > 0) {
      for (const c of cues) map.set(c.id, c.t);
      return map;
    }
    if (wordList) return map; // وضع الكلمات لا يحتاج توقيتات فقرات
    let acc = 0;
    for (const b of blocks) {
      map.set(b.id, dur * (acc / totalWords));
      acc += b.words;
    }
    return map;
  }, [cues, blocks, duration, durationSec, wordList]);

  const setActiveBlock = useCallback(
    (t: number) => {
      if (wordList) return;
      if (!playing && current === 0) return;
      const entries = [...timings.entries()].sort((a, b) => a[1] - b[1]);
      let activeId: string | null = null;
      for (const [id, start] of entries) {
        if (t + 0.35 >= start) activeId = id;
        else break;
      }
      document.querySelectorAll("#article-body .audio-active").forEach((el) => el.classList.remove("audio-active"));
      if (activeId) {
        const el = document.getElementById(activeId);
        if (el) {
          el.classList.add("audio-active");
          if (follow) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      }
    },
    [current, follow, playing, timings, wordList],
  );

  /* ==================== Media Session — التحكم من الخلفية وقفل الشاشة ==================== */

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "قراءة صوتية — كلام له لازمة",
        artist: "كلام له لازمة",
        album: sectionName || "مقالات المنصة",
        artwork: coverImage ? [{ src: coverImage, sizes: "512x512", type: "image/jpeg" }] : [],
      });
      navigator.mediaSession.setActionHandler("play", () => audioRef.current?.play());
      navigator.mediaSession.setActionHandler("pause", () => audioRef.current?.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => skipRef.current?.(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => skipRef.current?.(10));
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime != null && audioRef.current) {
          audioRef.current.currentTime = d.seekTime;
        }
      });
    } catch {}
    return () => {
      try {
        navigator.mediaSession.metadata = null;
      } catch {}
    };
  }, [coverImage, sectionName, title]);

  const updatePositionState = useCallback(
    (t: number) => {
      try {
        if ("mediaSession" in navigator && "setPositionState" in navigator.mediaSession && duration) {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: rate,
            position: Math.min(t, duration),
          });
        }
      } catch {}
    },
    [duration, rate],
  );

  /* ==================== تحكم التشغيل ==================== */

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      if (!audio.src) audio.src = await resolveSrc();
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [resolveSrc]);

  const skipRef = useRef<(delta: number) => void>(null);

  const skip = useCallback(
    (delta: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.max(0, Math.min((duration || 0) - 0.5, audio.currentTime + delta));
    },
    [duration],
  );

  useEffect(() => {
    skipRef.current = skip;
  }, [skip]);

  const cycleRate = useCallback(() => {
    setRate((r) => {
      const next = r === 1 ? 1.25 : r === 1.25 ? 1.5 : 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setCurrent(t);
    updatePositionState(t);
    if (wordList) {
      const idx = activeWordIndex(t);
      setActiveWord(idx);
    } else {
      setActiveBlock(t);
    }
  }, [activeWordIndex, setActiveBlock, setActiveWord, updatePositionState, wordList]);

  const seekFromBar = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = 1 - (e.clientX - rect.left) / rect.width; // RTL
      audio.currentTime = Math.max(0, Math.min(duration - 0.2, ratio * duration));
    },
    [duration],
  );

  /* القفز بالنقر على أي كلمة داخل المقال */
  useEffect(() => {
    if (!wordList) return;
    const handler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-wi]") as HTMLElement | null;
      if (!target) return;
      const wi = Number(target.dataset.wi);
      const word = wordList[wi];
      const audio = audioRef.current;
      if (!word || !audio) return;
      if (!audio.src) {
        resolveSrc().then((u) => {
          audio.src = u;
          audio.currentTime = word.s;
          audio.play().catch(() => {});
        });
        return;
      }
      audio.currentTime = word.s;
      if (audio.paused) audio.play().catch(() => {});
    };
    const body = document.getElementById("article-body");
    body?.addEventListener("click", handler);
    return () => body?.removeEventListener("click", handler);
  }, [resolveSrc, wordList]);

  /* تنظيف الإبراز عند التفكيك */
  useEffect(() => {
    return () => {
      document.querySelectorAll(".audio-word-active, #article-body .audio-active").forEach((n) =>
        n.classList.remove("audio-word-active", "audio-active"),
      );
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  return (
    <>
      <div
        className="rounded-2xl border p-4 shadow-soft"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        dir="rtl"
      >
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setPlaying(true);
          setSessionActive(true);
        }}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setSessionActive(false);
          setActiveWord(-1);
          document.querySelectorAll("#article-body .audio-active").forEach((el) => el.classList.remove("audio-active"));
          void cacheAudio(); /* تخزين محلي للزائر المتكرر — بلا استهلاك شبكة إضافي */
        }}
        onError={() => setActiveWord(-1)}
      />

      {wordList ? (
        <p className="mb-3 flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
          قراءة متزامنة كلمة بكلمة — انقر أي كلمة ليبدأ الصوت منها
        </p>
      ) : null}

      <div className="audio-controls flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          onClick={toggle}
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-soft transition-transform hover:scale-105 active:scale-95"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.87l10.4-6.86a1 1 0 0 0 0-1.72L9.55 4.27A1 1 0 0 0 8 5.14Z" /></svg>
          )}
        </button>

        <button onClick={() => skip(10)} aria-label="إرجاع ١٠ ثوانٍ" className="rounded-full p-2 text-sm transition-colors hover:bg-[var(--accent-soft)]" style={{ color: "var(--ink-muted)" }} title="إرجاع ١٠ ثوانٍ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(-1)" }}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
        </button>
        <button onClick={() => skip(-10)} aria-label="تقديم ١٠ ثوانٍ" className="rounded-full p-2 text-sm transition-colors hover:bg-[var(--accent-soft)]" style={{ color: "var(--ink-muted)" }} title="تقديم ١٠ ثوانٍ">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "scaleX(1)" }}><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
        </button>

        {/* شريط التقدم RTL */}
        <div className="flex-1">
          <div
            onClick={seekFromBar}
            className="group relative h-2.5 cursor-pointer overflow-hidden rounded-full"
            style={{ background: "var(--border)" }}
            role="slider"
            aria-label="شريط تقدم الصوت"
            aria-valuenow={Math.round(current)}
            aria-valuemax={Math.round(duration)}
          >
            <div
              className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-200"
              style={{
                width: duration ? `${(current / duration) * 100}%` : "0%",
                background: "linear-gradient(90deg, var(--accent-strong), var(--accent))",
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--ink-muted)" }}>
            <span>{fmtTime(current)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={cycleRate}
          className="rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-[var(--accent-soft)]"
          style={{ color: "var(--accent-strong)" }}
          title="سرعة التشغيل"
        >
          ×{easternDigits(rate)}
        </button>

        <button
          onClick={() => setFollow((f) => !f)}
          className={`rounded-full p-2 transition-colors hover:bg-[var(--accent-soft)] ${follow ? "" : "opacity-40"}`}
          style={{ color: "var(--accent-strong)" }}
          title="تتبع القراءة تلقائيًا"
          aria-pressed={follow}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </button>
      </div>
      </div>

      {/* ==================== كبسولة التحكم الصوتي العائمة ====================
          تُرسَم عبر Portal إلى جسم الصفحة مباشرة حتى لا يخفيها وضع الغمر
          (body.immersion يُعتم عناصر page-chrome التي يقع داخلها المشغل)،
          وتبقى ثابتة مهما تحركت الصفحة تلقائيًا أو يدويًا — إيقاف الصوت
          بلمسة واحدة دون البحث عن المشغل.

          الهندسة والمسافات:
          - أسفل الشاشة فوق شريط أدوات القراءة المثبت (bottom-0 بحوالي 68px):
            هامش سفلي 5rem + safe-area لأجهزة Android/iOS ذات الشاشات الكاملة.
          - أفقياً: قرب الحافة (left) على الهواتف، ومحاذاة إطار المحتوى
            max-w-5xl على الشاشات العريضة (حافة المحتوى اليسرى + padding).
          - هدف لمس زر التشغيل/الإيقاف 48×48px + حالة hover ناعمة للحاسوب. */}
      {sessionActive &&
        createPortal(
          <div dir="ltr" className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
            <div className="flex justify-start pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pl-[max(1.5rem,calc(50%-30.5rem))]">
              <div
                className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-zinc-900 py-2 pl-2 pr-3.5 text-white shadow-2xl transition-all duration-300 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] dark:bg-white dark:text-zinc-900 sm:py-2.5"
                role="group"
                aria-label="التحكم العائم في الصوت"
              >
                <button
                  onClick={toggle}
                  aria-label={playing ? "إيقاف الصوت مؤقتًا" : "متابعة التشغيل"}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-md transition-transform hover:scale-105 active:scale-95"
                >
                  {playing ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.87l10.4-6.86a1 1 0 0 0 0-1.72L9.55 4.27A1 1 0 0 0 8 5.14Z" /></svg>
                  )}
                </button>

                {/* المؤشر المصغر للوقت + شريط تقدم مصغر */}
                <div className="flex select-none flex-col items-start gap-1.5">
                  <span className="font-ui flex items-center gap-1.5 text-xs font-bold tabular-nums leading-none">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full bg-amber-400 ${playing ? "animate-pulse" : "opacity-30"}`}
                    />
                    {fmtTime(current)} / {fmtTime(duration)}
                  </span>
                  <span
                    aria-hidden
                    className="relative block h-1 w-16 overflow-hidden rounded-full bg-white/25 dark:bg-zinc-900/20 sm:w-20"
                  >
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width] duration-200"
                      style={{ width: duration ? `${Math.min(100, (current / duration) * 100)}%` : "0%" }}
                    />
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
