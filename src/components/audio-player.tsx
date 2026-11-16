"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { get, set } from "idb-keyval";
import { easternDigits } from "@/lib/utils";

type Cue = { t: number; id: string };
type BlockMeta = { id: string; words: number };
type WordTiming = { w: string; s: number; e: number };

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const RATE_KEY = "kalam_audio_rate";
const FOLLOW_KEY = "kalam_audio_follow";

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${easternDigits(m)}:${easternDigits(String(s).padStart(2, "0"))}`;
}

export function AudioPlayer({
  src,
  durationSec,
  cues,
  blocks,
  words,
  highlightMap,
  jumpMap,
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
  highlightMap?: number[] | null;
  jumpMap?: number[] | null;
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
  const [sessionActive, setSessionActive] = useState(false);
  const [resumedFrom, setResumedFrom] = useState(0);
  const clearedResumeRef = useRef(false);
  const silenceHighlightUntilRef = useRef(0);
  const seekingBarRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const allowScrollOnSeekRef = useRef(false);

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

  const posKey = `kalam-audio-pos:${slug}`;
  const lastSaveRef = useRef(0);
  const savePos = useCallback(
    (t: number, isPlaying: boolean) => {
      try {
        localStorage.setItem(posKey, JSON.stringify({ t, playing: isPlaying, rate, at: Date.now() }));
      } catch {}
    },
    [posKey, rate],
  );

  const wordList = useMemo(
    () => (words && words.length > 0 ? [...words].sort((a, b) => a.s - b.s) : null),
    [words],
  );

  const [calibrated, setCalibrated] = useState<WordTiming[] | null>(null);
  const effWords = calibrated ?? wordList;

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

  useEffect(() => {
    wordElsRef.current = null;
    return () => {
      wordElsRef.current = null;
    };
  }, [syncKey]);

  useEffect(() => {
    document
      .querySelectorAll(".audio-word-active")
      .forEach((n) => n.classList.remove("audio-word-active"));
    document
      .querySelectorAll("#article-body .audio-active")
      .forEach((n) => n.classList.remove("audio-active"));
    activeWordRef.current = -1;

    const audio = audioRef.current;
    if (audio && !audio.paused && !audio.ended) {
      const raf = requestAnimationFrame(() => {
        setActiveWordRef.current(activeWordIndexRef.current(audio.currentTime));
      });
      return () => cancelAnimationFrame(raf);
    }
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

      const domIdx =
        idx >= 0 && highlightMap ? (highlightMap[idx] ?? -1) : idx;

      const el = domIdx >= 0 ? els.get(domIdx) : null;
      if (el) {
        el.classList.add("audio-word-active");
        const blockEl = el.closest("[id^='blk-']");
        blockEl?.classList.add("audio-active");

        const shouldScroll = follow && (!audioRef.current?.paused || allowScrollOnSeekRef.current);
        allowScrollOnSeekRef.current = false;
        if (shouldScroll) {
          const rect = el.getBoundingClientRect();
          const topBand = window.innerHeight * 0.22;
          const bottomBand = window.innerHeight * 0.78;
          if (rect.top < topBand || rect.bottom > bottomBand) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      } else {
        allowScrollOnSeekRef.current = false;
        if (idx < 0) {
          document.querySelectorAll(".audio-word-active").forEach((n) => n.classList.remove("audio-word-active"));
          document.querySelectorAll("#article-body .audio-active").forEach((n) => n.classList.remove("audio-active"));
        }
      }
    },
    [follow, highlightMap, wordElements],
  );

  const activeWordIndex = useCallback(
    (t: number): number => {
      if (!effWords) return -1;
      let lo = 0;
      let hi = effWords.length - 1;
      let found = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const w = effWords[mid];
        if (t < w.s) hi = mid - 1;
        else if (t > w.e) lo = mid + 1;
        else {
          found = mid;
          break;
        }
      }
      if (found === -1 && lo > 0 && lo <= effWords.length) found = lo - 1;
      return found;
    },
    [effWords],
  );

  const setActiveWordRef = useRef(setActiveWord);
  useEffect(() => {
    setActiveWordRef.current = setActiveWord;
  }, [setActiveWord]);
  const activeWordIndexRef = useRef(activeWordIndex);
  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  const timings = useMemo(() => {
    const totalWords = blocks.reduce((a, b) => a + b.words, 0) || 1;
    const dur = duration || durationSec || 0;
    const map = new Map<string, number>();
    if (cues && cues.length > 0) {
      for (const c of cues) map.set(c.id, c.t);
      return map;
    }
    if (effWords) return map;
    let acc = 0;
    for (const b of blocks) {
      map.set(b.id, dur * (acc / totalWords));
      acc += b.words;
    }
    return map;
  }, [cues, blocks, duration, durationSec, effWords]);

  const setActiveBlock = useCallback(
    (t: number) => {
      if (effWords) return;
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
          const shouldScroll = follow && (!audioRef.current?.paused || allowScrollOnSeekRef.current);
          allowScrollOnSeekRef.current = false;
          if (shouldScroll) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        } else {
          allowScrollOnSeekRef.current = false;
        }
      } else {
        allowScrollOnSeekRef.current = false;
      }
    },
    [current, effWords, follow, playing, timings],
  );

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

  const startFromBeginning = useCallback(async () => {
    clearedResumeRef.current = true;
    try {
      localStorage.removeItem(posKey);
    } catch {}
    lastSaveRef.current = Date.now();
    setResumedFrom(0);
    document.querySelectorAll(".audio-word-active").forEach((n) => n.classList.remove("audio-word-active"));
    document.querySelectorAll("#article-body .audio-active").forEach((el) => el.classList.remove("audio-active"));
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.src) audio.src = await resolveSrc();
    try {
      audio.currentTime = 0;
    } catch {}
    setCurrent(0);
  }, [posKey, resolveSrc]);

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
    const next = rate === 1 ? 1.25 : rate === 1.25 ? 1.5 : 1;
    setRate(next);
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = next;
      audioRef.current.playbackRate = next;
    }
    try {
      localStorage.setItem(RATE_KEY, String(next));
    } catch {}
  }, [rate]);

  const toggleFollow = useCallback(() => {
    const next = !follow;
    setFollow(next);
    try {
      localStorage.setItem(FOLLOW_KEY, next ? "on" : "off");
    } catch {}
  }, [follow]);

  useIsomorphicLayoutEffect(() => {
    try {
      const saved = parseFloat(localStorage.getItem(RATE_KEY) ?? "");
      if (saved === 1.25 || saved === 1.5) {
        setRate(saved);
        if (audioRef.current) {
          audioRef.current.defaultPlaybackRate = saved;
          audioRef.current.playbackRate = saved;
        }
      }
    } catch {}
    try {
      if (localStorage.getItem(FOLLOW_KEY) === "off") setFollow(false);
    } catch {}
  }, []);
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.defaultPlaybackRate = rate;
      audioRef.current.playbackRate = rate;
    }
  }, [rate]);

  const onTimeUpdate = useCallback(() => {
    if (seekingBarRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const t = audio.currentTime;
    setCurrent(t);
    updatePositionState(t);
    const now = Date.now();
    if (now - lastSaveRef.current > 2000) {
      lastSaveRef.current = now;
      savePos(t, true);
    }
    if (Date.now() >= silenceHighlightUntilRef.current) {
      if (effWords) {
        const idx = activeWordIndex(t);
        setActiveWord(idx);
      } else {
        setActiveBlock(t);
      }
    }
  }, [activeWordIndex, effWords, savePos, setActiveBlock, setActiveWord, updatePositionState]);

  const previewSeekAtClientX = useCallback(
    (clientX: number, rect: DOMRect, rtl: boolean) => {
      const effDur = duration || durationSec || 0;
      if (!effDur || rect.width <= 0) return;
      const rawRatio = (clientX - rect.left) / rect.width;
      const clamped = Math.max(0, Math.min(1, rtl ? 1 - rawRatio : rawRatio));
      const target = Math.max(0, Math.min(effDur - 0.15, clamped * effDur));
      pendingSeekRef.current = target;
      setCurrent(target);
    },
    [duration, durationSec],
  );

  const commitSeek = useCallback(
    async (scrollAfterSeek: boolean) => {
      seekingBarRef.current = false;
      const target = pendingSeekRef.current;
      pendingSeekRef.current = null;
      const audio = audioRef.current;
      if (target == null || !audio) return;
      if (!audio.src) {
        audio.src = await resolveSrc();
      }
      if (!scrollAfterSeek) {
        /* المشغل الأساسي: لا يقفز المقال للأسفل ولا يلون الكلمات أثناء اللمس/السحب */
        allowScrollOnSeekRef.current = false;
        silenceHighlightUntilRef.current = Date.now() + 250;
      } else {
        /* المشغل العائم المصغر: يمكنه الانتقال لموضع الصوت الجديد عند الإفلات دون تلوين مسار السحب */
        allowScrollOnSeekRef.current = true;
      }
      try {
        audio.currentTime = target;
      } catch {}
      setCurrent(target);
    },
    [resolveSrc],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: { t: number; playing: boolean; rate?: number; at?: number } | null = null;
      try {
        const raw = localStorage.getItem(posKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.t === "number" && parsed.t > 1 && Date.now() - (parsed.at ?? 0) < 60 * 60 * 1000) {
            saved = parsed;
          } else {
            localStorage.removeItem(posKey);
          }
        }
      } catch {}
      if (!saved || cancelled) return;
      const audio = audioRef.current;
      if (!audio) return;
      const url = await resolveSrc();
      if (cancelled) return;
      audio.src = url;
      if (saved.rate && saved.rate !== 1) {
        audio.defaultPlaybackRate = saved.rate;
        audio.playbackRate = saved.rate;
        setRate(saved.rate);
        try {
          localStorage.setItem(RATE_KEY, String(saved.rate));
        } catch {}
      }
      const apply = () => {
        if (cancelled || clearedResumeRef.current) return;
        silenceHighlightUntilRef.current = Date.now() + 600;
        try {
          audio.currentTime = saved!.t;
        } catch {}
        setCurrent(saved!.t);
        setResumedFrom(saved!.t);
      };
      if (audio.readyState >= 1) apply();
      else audio.addEventListener("loadedmetadata", apply, { once: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [posKey, resolveSrc]);

  useEffect(() => {
    const onSave = () => {
      const audio = audioRef.current;
      if (!audio || !audio.src || audio.ended) return;
      savePos(audio.currentTime, !audio.paused);
    };
    window.addEventListener("beforeunload", onSave);
    return () => window.removeEventListener("beforeunload", onSave);
  }, [savePos]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audio.src && !audio.paused) savePos(audio.currentTime, true);
  }, [rate, savePos]);

  useEffect(() => {
    if (!effWords) return;
    const handler = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest?.("[data-wi]") as HTMLElement | null;
      if (!target) return;
      const domIdx = Number(target.dataset.wi);
      const audioIdx = jumpMap ? (jumpMap[domIdx] ?? -1) : domIdx;
      const word = audioIdx >= 0 ? effWords[audioIdx] : undefined;
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
  }, [effWords, jumpMap, resolveSrc]);

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
          if (isFinite(d) && d > 0) {
            setDuration(d);
            if (wordList && wordList.length > 0) {
              const lastEnd = wordList[wordList.length - 1].e;
              const k = d / lastEnd;
              setCalibrated(Math.abs(k - 1) > 0.015 ? wordList.map((w) => ({ w: w.w, s: w.s * k, e: w.e * k })) : null);
            }
          }
        }}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setPlaying(true);
          setSessionActive(true);
          lastSaveRef.current = 0;
        }}
        onPause={() => {
          setPlaying(false);
          const a = audioRef.current;
          if (a && a.src && !a.ended) savePos(a.currentTime, false);
        }}
        onEnded={() => {
          setPlaying(false);
          setSessionActive(false);
          setActiveWord(-1);
          setResumedFrom(0);
          lastSaveRef.current = 0;
          try {
            localStorage.removeItem(posKey);
          } catch {}
          document.querySelectorAll("#article-body .audio-active").forEach((el) => el.classList.remove("audio-active"));
          void cacheAudio();
        }}
        onError={() => setActiveWord(-1)}
      />

      {effWords ? (
        <p className="mb-3 flex items-center gap-2 text-[11px]" style={{ color: "var(--ink-muted)" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
          قراءة متزامنة كلمة بكلمة — انقر أي كلمة ليبدأ الصوت منها
        </p>
      ) : null}

      <div className="audio-controls flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <button
          onClick={toggle}
          aria-label={playing ? "إيقاف مؤقت" : "تشغيل"}
          className="order-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-soft transition-transform hover:scale-105 active:scale-95 sm:order-none"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.87l10.4-6.86a1 1 0 0 0 0-1.72L9.55 4.27A1 1 0 0 0 8 5.14Z" /></svg>
          )}
        </button>

        <button onClick={() => skip(-10)} aria-label="إرجاع ١٠ ثوانٍ إلى الخلف" className="order-3 rounded-full p-2 text-sm transition-colors hover:bg-(--accent-soft) sm:order-none" style={{ color: "var(--ink-muted)" }} title="إرجاع ١٠ ثوانٍ إلى الخلف">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><g transform="scale(-1,1) translate(-24,0)"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></g><text x="12" y="15.3" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="currentColor">١٠</text></svg>
        </button>
        <button onClick={() => skip(10)} aria-label="تقديم ١٠ ثوانٍ إلى الأمام" className="order-3 rounded-full p-2 text-sm transition-colors hover:bg-(--accent-soft) sm:order-none" style={{ color: "var(--ink-muted)" }} title="تقديم ١٠ ثوانٍ إلى الأمام">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /><text x="12" y="15.3" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="currentColor">١٠</text></svg>
        </button>

        {resumedFrom > 0 && (
          <button
            onClick={() => void startFromBeginning()}
            aria-label="مسح موضع الاستئناف والعودة إلى بداية الصوت"
            className="order-3 rounded-full p-2 text-sm transition-colors hover:bg-(--accent-soft) sm:order-none"
            style={{ color: "var(--ink-muted)" }}
            title="مسح موضع الاستئناف والعودة إلى بداية الصوت"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}

        {/* شريط التقدم RTL — يدعم السحب والنقر بالإصبع والماوس دون تشتيت المقال أثناء السحب */}
        <div className="order-2 min-w-[calc(100%-4rem)] flex-1 sm:order-none sm:min-w-0">
          <div
            onPointerDown={(e) => {
              seekingBarRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              previewSeekAtClientX(e.clientX, e.currentTarget.getBoundingClientRect(), true);
            }}
            onPointerMove={(e) => {
              if (!seekingBarRef.current) return;
              previewSeekAtClientX(e.clientX, e.currentTarget.getBoundingClientRect(), true);
            }}
            onPointerUp={() => {
              void commitSeek(false);
            }}
            onPointerCancel={() => {
              seekingBarRef.current = false;
              pendingSeekRef.current = null;
            }}
            className="group relative flex h-6 cursor-pointer touch-none select-none items-center"
            role="slider"
            aria-label="شريط تقدم الصوت"
            aria-valuenow={Math.round(current)}
            aria-valuemax={Math.round(duration)}
          >
            <span className="relative block h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
              <span
                className="absolute inset-y-0 right-0 rounded-full transition-[width] duration-75"
                style={{
                  width: duration ? `${(current / duration) * 100}%` : "0%",
                  background: "linear-gradient(90deg, var(--accent-strong), var(--accent))",
                }}
              />
            </span>
          </div>
          <div className="flex justify-between text-[11px]" style={{ color: "var(--ink-muted)" }}>
            <span>{fmtTime(current)}</span>
            <span>{fmtTime(duration)}</span>
          </div>
        </div>

        <button
          onClick={cycleRate}
          className="order-3 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors hover:bg-(--accent-soft) sm:order-none"
          style={{ color: "var(--accent-strong)" }}
          title="سرعة التشغيل"
        >
          ×{easternDigits(rate)}
        </button>

        <button
          onClick={toggleFollow}
          className={`order-3 rounded-full p-2 transition-colors hover:bg-(--accent-soft) sm:order-none ${follow ? "" : "opacity-40"}`}
          style={{ color: "var(--accent-strong)" }}
          title="تتبع القراءة تلقائيًا"
          aria-pressed={follow}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </button>
      </div>
      </div>

      {sessionActive &&
        createPortal(
          <div dir="ltr" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40">
            <div className="flex justify-start pb-[calc(4rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pl-[max(1.5rem,calc(50%-30.5rem))]">
              <div
                className={`pointer-events-auto flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-zinc-900 py-2 pl-2 pr-3.5 text-white shadow-2xl transition-all duration-300 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] dark:bg-white dark:text-zinc-900 sm:py-2.5 ${
                  playing ? "opacity-100" : "opacity-35 [@media(hover:hover)]:hover:opacity-100"
                }`}
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

                <div className="flex select-none flex-col items-start gap-1">
                  <span className="font-ui flex items-center gap-1.5 text-xs font-bold tabular-nums leading-none">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 rounded-full bg-amber-400 ${playing ? "animate-pulse" : "opacity-30"}`}
                    />
                    {fmtTime(current)} / {fmtTime(duration)}
                  </span>
                  <div
                    onPointerDown={(e) => {
                      seekingBarRef.current = true;
                      e.currentTarget.setPointerCapture(e.pointerId);
                      previewSeekAtClientX(e.clientX, e.currentTarget.getBoundingClientRect(), false);
                    }}
                    onPointerMove={(e) => {
                      if (!seekingBarRef.current) return;
                      previewSeekAtClientX(e.clientX, e.currentTarget.getBoundingClientRect(), false);
                    }}
                    onPointerUp={() => {
                      void commitSeek(true);
                    }}
                    onPointerCancel={() => {
                      seekingBarRef.current = false;
                      pendingSeekRef.current = null;
                    }}
                    role="slider"
                    aria-label="شريط تقدم الصوت المصغر"
                    aria-valuenow={Math.round(current)}
                    aria-valuemax={Math.round(duration)}
                    className="flex h-4 w-20 cursor-pointer touch-none select-none items-center sm:w-24"
                  >
                    <span className="relative block h-1.5 w-full overflow-hidden rounded-full bg-white/25 dark:bg-zinc-900/20">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width] duration-75"
                        style={{ width: duration ? `${Math.min(100, (current / duration) * 100)}%` : "0%" }}
                      />
                    </span>
                  </div>
                </div>

                <button
                  onClick={cycleRate}
                  aria-label="سرعة التشغيل"
                  title="سرعة التشغيل"
                  className="font-ui no-touch-grow flex h-8 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white/70 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-900/60 dark:hover:bg-zinc-900/10 dark:hover:text-zinc-900"
                >
                  ×{easternDigits(rate)}
                </button>

                <button
                  onClick={() => {
                    audioRef.current?.pause();
                    setSessionActive(false);
                  }}
                  aria-label="إغلاق المشغل العائم وإيقاف الصوت"
                  title="إغلاق"
                  className="no-touch-grow flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-900/60 dark:hover:bg-zinc-900/10 dark:hover:text-zinc-900"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
