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
  /* خريطة فهرس الصوت ← فهرس العرض (مواءمة تجريد التشكيل) — null = هوية */
  highlightMap?: number[] | null;
  /* خريطة فهرس العرض ← فهرس الصوت للقفز بالنقر على كلمة */
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

  /* حفظ موضع الصوت — استئناف الجلسة بعد إعادة تحميل الصفحة */
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

  /* ==================== معايرة التوقيتات على المدة الفعلية ====================
     دمج مقاطع MP3 يضيف حشوة ترميز صغيرة لكل مقطع فيصبح الملف الفعلي أطول
     من مجموع مدد الـPCM المفترضة — ومع الوقت يسبق التظليل الصوت بتراكمي.
     لحظة معرفة المدة الحقيقية من المتصفح تُمدَّد/تُضاغط كل الطوابع بنسبة
     المدة الفعلية إلى آخر نهاية كلمة — تصحيح عالمي يحمي كل المقالات القديمة. */
  const [calibrated, setCalibrated] = useState<WordTiming[] | null>(null);
  const effWords = calibrated ?? wordList;

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
    return () => {
      wordElsRef.current = null;
    };
  }, [syncKey]);

  /* أحدث نسخ من الدوال للمزامنة — تُستدعى من تأثير syncKey دون إعادة تشغيله
     (تُعرّف بعد إعلان setActiveWord وactiveWordIndex أسفل لتفادي TDZ) */

  /* ============ تطهير التحديد الشبحي عند تبديل وضع التشكيل ============
     أي تظليل ثابت معلّق يُزال فورًا من الـ DOM، ثم يستدعى
     requestAnimationFrame لإعادة رسم كبسولة التظليل النشطة على
     موقع الكلمة الحالية الصحيح وفق أبعاد النص الجديدة */
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

      /* المواءمة الموحدة: فهرس الصوت ← فهرس كلمة العرض المعروضة
         (المشكول أو المجرد) — بلا مطابقة نصية ولا اعتماد على الأطوال */
      const domIdx =
        idx >= 0 && highlightMap ? (highlightMap[idx] ?? -1) : idx;

      const el = domIdx >= 0 ? els.get(domIdx) : null;
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
    [follow, highlightMap, wordElements],
  );

  /** البحث الثنائي عن الكلمة المقروءة الآن */
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

  /* أحدث نسخ من الدوال للمزامنة — يستدعيهما تأثير تطهير syncKey أعلاه
     عبر المراجع دون إعادة تشغيله عند كل تغيّر تبعية */
  const setActiveWordRef = useRef(setActiveWord);
  useEffect(() => {
    setActiveWordRef.current = setActiveWord;
  }, [setActiveWord]);
  const activeWordIndexRef = useRef(activeWordIndex);
  useEffect(() => {
    activeWordIndexRef.current = activeWordIndex;
  }, [activeWordIndex]);

  /* ==================== وضع الفقرات (توافقية الرفع اليدوي) ==================== */

  const timings = useMemo(() => {
    const totalWords = blocks.reduce((a, b) => a + b.words, 0) || 1;
    const dur = duration || durationSec || 0;
    const map = new Map<string, number>();
    if (cues && cues.length > 0) {
      for (const c of cues) map.set(c.id, c.t);
      return map;
    }
    if (effWords) return map; // وضع الكلمات لا يحتاج توقيتات فقرات
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
    /* حفظ دوري خفيف (كل ثانيتين) — مصدر استئناف الجلسة بعد التحديث */
    const now = Date.now();
    if (now - lastSaveRef.current > 2000) {
      lastSaveRef.current = now;
      savePos(t, true);
    }
    if (effWords) {
      const idx = activeWordIndex(t);
      setActiveWord(idx);
    } else {
      setActiveBlock(t);
    }
  }, [activeWordIndex, effWords, savePos, setActiveBlock, setActiveWord, updatePositionState]);

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

  /* ==================== استئناف الجلسة الصوتية بعد إعادة التحميل ====================
     موضع الصوت وحالته (تشغيل/إيقاف) والسرعة تُحفظ دوريًا محليًا، وعند العودة
     للمقال خلال ساعة يُعاد الصوت لنفس الكلمة بالضبط مع إبرازها — وإن كان
     التشغيل مستمرًا لحظة التحديث استُأنف تلقائيًا، وإن امتنع المتصفح
     (سياسة التشغيل التلقائي) استأنفه أول تفاعل دون أن يفقد موضعه */
  useEffect(() => {
    let cancelled = false;
    let resume: null | (() => void) = null;
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
        audio.playbackRate = saved.rate;
        setRate(saved.rate);
      }
      const apply = () => {
        if (cancelled) return;
        try {
          audio.currentTime = saved!.t;
        } catch {}
        setCurrent(saved!.t);
        setActiveWordRef.current(activeWordIndexRef.current(saved!.t));
        if (saved!.playing) {
          audio.play().catch(() => {
            /* سياسة التشغيل التلقائي — كبسولة جاهزة بالأمانة وأول لمسة يكمل */
            setSessionActive(true);
            resume = () => {
              resume = null;
              audio.play().catch(() => {});
            };
            window.addEventListener("pointerdown", resume, { once: true });
            window.addEventListener("keydown", resume, { once: true });
          });
        }
      };
      if (audio.readyState >= 1) apply();
      else audio.addEventListener("loadedmetadata", apply, { once: true });
    })();
    return () => {
      cancelled = true;
      if (resume) {
        window.removeEventListener("pointerdown", resume);
        window.removeEventListener("keydown", resume);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey, resolveSrc]);

  /* لقطة أخيرة عند مغادرة الصفحة — التحديث أثناء التشغيل لا يفقد شيئًا */
  useEffect(() => {
    const onSave = () => {
      const audio = audioRef.current;
      if (!audio || !audio.src || audio.ended) return;
      savePos(audio.currentTime, !audio.paused);
    };
    window.addEventListener("beforeunload", onSave);
    return () => window.removeEventListener("beforeunload", onSave);
  }, [savePos]);

  /* حفظ فوري عند تغيير سرعة التشغيل أثناء الاستماع */
  useEffect(() => {
    const audio = audioRef.current;
    if (audio && audio.src && !audio.paused) savePos(audio.currentTime, true);
  }, [rate, savePos]);

  /* القفز بالنقر على أي كلمة داخل المقال — الفهرس المعروض يُترجم
     إلى فهرس الصوت عبر خريطة المواءمة (تجريد التشكيل) قبل القفز */
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
          lastSaveRef.current = 0; /* احفظ فورًا في أول تحديث زمني */
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
          lastSaveRef.current = 0;
          try {
            localStorage.removeItem(posKey); /* جلسة منتهية — لا استئناف */
          } catch {}
          document.querySelectorAll("#article-body .audio-active").forEach((el) => el.classList.remove("audio-active"));
          void cacheAudio(); /* تخزين محلي للزائر المتكرر — بلا استهلاك شبكة إضافي */
        }}
        onError={() => setActiveWord(-1)}
      />

      {effWords ? (
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

        {/* إرجاع ١٠ ثوانٍ — سهم دائري رأسه لليمين (الرجوع عكس اتجاه التقدم في الـRTL) + الرقم في المركز */}
        <button onClick={() => skip(-10)} aria-label="إرجاع ١٠ ثوانٍ إلى الخلف" className="rounded-full p-2 text-sm transition-colors hover:bg-[var(--accent-soft)]" style={{ color: "var(--ink-muted)" }} title="إرجاع ١٠ ثوانٍ إلى الخلف">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><g transform="scale(-1,1) translate(-24,0)"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></g><text x="12" y="15.3" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="currentColor">١٠</text></svg>
        </button>
        {/* تقديم ١٠ ثوانٍ — سهم دائري رأسه لليسار (اتجاه التقدم في الـRTL) + الرقم في المركز */}
        <button onClick={() => skip(10)} aria-label="تقديم ١٠ ثوانٍ إلى الأمام" className="rounded-full p-2 text-sm transition-colors hover:bg-[var(--accent-soft)]" style={{ color: "var(--ink-muted)" }} title="تقديم ١٠ ثوانٍ إلى الأمام">
          <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /><text x="12" y="15.3" textAnchor="middle" fontSize="7.2" fontWeight="800" fill="currentColor">١٠</text></svg>
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
          - أسفل الشاشة فوق شريط أدوات القراءة المثبت (bottom-0 بحوالي 64px):
            هامش سفلي 4rem + safe-area لأجهزة Android/iOS ذات الشاشات الكاملة.
          - عند الإيقاف المؤقت يخفت المشغل (opacity-35) ليكشف نصوص المقال
            خلفه، ويعود مصمتًا عند التحويم أو استئناف التشغيل.
          - أفقياً: قرب الحافة (left) على الهواتف، ومحاذاة إطار المحتوى
            max-w-5xl على الشاشات العريضة (حافة المحتوى اليسرى + padding).
          - هدف لمس زر التشغيل/الإيقاف 48×48px + حالة hover ناعمة للحاسوب. */}
      {sessionActive &&
        createPortal(
          <div dir="ltr" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40">
            <div className="flex justify-start pb-[calc(4rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pl-[max(1.5rem,calc(50%-30.5rem))]">
              <div
                className={`pointer-events-auto flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-zinc-900 py-2 pl-2 pr-3.5 text-white shadow-2xl transition-all duration-300 hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] dark:bg-white dark:text-zinc-900 sm:py-2.5 ${
                  /* عند الإيقاف المؤقت يخفت المشغل ليكشف نص المقال خلفه — ويتوهج عند التحويم أو التشغيل */
                  playing ? "opacity-100" : "opacity-35 hover:opacity-100"
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

                {/* سرعة التشغيل — نفس دورة المشغل الكبير (١ ← ١.٢٥ ← ١.٥ ← ١)
                    والحالة واحدة فالزران يبقيان متزامنين دائمًا */}
                <button
                  onClick={cycleRate}
                  aria-label="سرعة التشغيل"
                  title="سرعة التشغيل"
                  className="font-ui flex h-8 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums text-white/70 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-900/60 dark:hover:bg-zinc-900/10 dark:hover:text-zinc-900"
                >
                  ×{easternDigits(rate)}
                </button>

                {/* زر الإغلاق — يوقف الصوت ويشيّل الكبسولة العائمة لمن انتهى منه */}
                <button
                  onClick={() => {
                    audioRef.current?.pause();
                    setSessionActive(false);
                  }}
                  aria-label="إغلاق المشغل العائم وإيقاف الصوت"
                  title="إغلاق"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white dark:text-zinc-900/60 dark:hover:bg-zinc-900/10 dark:hover:text-zinc-900"
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
