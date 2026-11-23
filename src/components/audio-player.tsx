"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { get, set } from "idb-keyval";
import { audioStorageKeys } from "@/lib/audio-storage";
import { canSilentlyReengage, followReturnAriaLabel, followReturnLabel, followTargetDirection, gentleFollowScrollTop, isWordOutOfUsableArea, withinComfortBand, type FollowTarget } from "@/lib/follow-target";
import { easternDigits } from "@/lib/utils";

type Cue = { t: number; id: string };
type BlockMeta = { id: string; words: number };
type WordTiming = { w: string; s: number; e: number };

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const RATE_KEY = "kalam_audio_rate";
const FOLLOW_KEY = "kalam_audio_follow";

/* أيقونة زر التتبع: سهم يشاور فعلًا ناحية الكلام المسموع عند الرجوع،
   وعلامة محايدة للتتبع التلقائي حتى لا ينسرق معنى السهم الاتجاهي */
function FollowIcon({ paused, target, size }: { paused: boolean; target: FollowTarget; size: number }) {
  if (paused && target === "up") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 19V5M5 12l7-7 7 7" /></svg>
    );
  }
  if (paused && target === "down") {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 5v14M5 12l7 7 7-7" /></svg>
    );
  }
  if (paused) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none" /></svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
  );
}

/* احترام «تقليل الحركة»: قفزة فورية بدل التمرير الناعم */
function scrollBehavior(): ScrollBehavior {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  } catch {
    return "smooth";
  }
}

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
  audioRevision,
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
  audioRevision?: string;
  title?: string;
  sectionName?: string | null;
  coverImage?: string | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);
  /* إيقاف مؤقت للمتابعة بسبب تحريك القارئ للصفحة بيده — لا يُحفظ، ولا يوقف الصوت أو التظليل */
  const [followPaused, setFollowPaused] = useState(false);
  /* اتجاه الكلام المسموع بالنسبة للشاشة أثناء التوقف المؤقت — يقود سهم الرجوع ونصه */
  const [followTarget, setFollowTarget] = useState<FollowTarget>("down");
  const followActiveRef = useRef(true);
  const followRef = useRef(true);
  const idleReengageRef = useRef<number | null>(null);
  const programmaticScrollUntilRef = useRef(0);
  const [sessionActive, setSessionActive] = useState(false);
  const [inlineInView, setInlineInView] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const inlinePlayerRef = useRef<HTMLDivElement | null>(null);
  const [mobileToolbarHeight, setMobileToolbarHeight] = useState(68);
  const miniPlayerRef = useRef<HTMLDivElement | null>(null);
  const [resumedFrom, setResumedFrom] = useState(0);
  const clearedResumeRef = useRef(false);
  const silenceHighlightUntilRef = useRef(0);
  const seekingBarRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const allowScrollOnSeekRef = useRef(false);

  /* الكبسولة المصغرة لا تظهر إلا بعد خروج المشغل الأساسي من الشاشة —
     فلا يوجد زران إيقاف وشريطا تقدم للصوت نفسه في وقت واحد */
  const miniVisible = sessionActive && !inlineInView;

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("kalam:audio-capsule", { detail: { active: miniVisible } }),
    );
    return () => {
      window.dispatchEvent(new CustomEvent("kalam:audio-capsule", { detail: { active: false } }));
    };
  }, [miniVisible]);

  useEffect(() => {
    const el = inlinePlayerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        setInlineInView(entries[0]?.isIntersecting ?? true);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639.98px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  /* Dock against the toolbar's real height, including safe-area/font changes.
     Reserve the mini player's own measured height so the last line stays reachable. */
  useEffect(() => {
    if (!(miniVisible && isMobile)) return;
    const toolbar = document.getElementById("reading-toolbar");
    const mini = miniPlayerRef.current;
    const body = document.body;
    const prev = body.style.paddingBottom;
    const measure = () => {
      if (toolbar) setMobileToolbarHeight(toolbar.getBoundingClientRect().height);
      const height = mini?.getBoundingClientRect().height ?? 60;
      body.style.paddingBottom = prev ? `calc(${prev} + ${height}px)` : `${height}px`;
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (toolbar) observer.observe(toolbar, { box: "border-box" });
    if (mini) observer.observe(mini, { box: "border-box" });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      body.style.paddingBottom = prev;
    };
  }, [miniVisible, isMobile]);

  const wordElsRef = useRef<Map<number, Element> | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const cachedRef = useRef(false);
  const activeWordRef = useRef<number>(-1);

  const storageKeys = useMemo(() => audioStorageKeys(slug, src, audioRevision), [slug, src, audioRevision]);
  const posKey = storageKeys.position;
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
      const blob = (await get(storageKeys.audio)) as Blob | undefined;
      if (blob && blob.size > 0) {
        cachedRef.current = true;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        return url;
      }
    } catch {}
    return src;
  }, [storageKeys.audio, src]);

  const cacheAudio = useCallback(async () => {
    if (cachedRef.current) return;
    try {
      cachedRef.current = true;
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) return;
      const blob = await res.blob();
      if (blob.size > 0 && blob.size < 40 * 1024 * 1024) {
        await set(storageKeys.audio, blob);
      }
    } catch {}
  }, [storageKeys.audio, src]);

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

        const shouldScroll = (followActiveRef.current || allowScrollOnSeekRef.current) && (!audioRef.current?.paused || allowScrollOnSeekRef.current);
        allowScrollOnSeekRef.current = false;
        if (shouldScroll) {
          const rect = el.getBoundingClientRect();
          if (!withinComfortBand(rect.top, rect.bottom, window.innerHeight)) {
            programmaticScrollUntilRef.current = Date.now() + 1500;
            window.scrollTo({ top: gentleFollowScrollTop(rect.top, window.scrollY, window.innerHeight), behavior: scrollBehavior() });
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
    [highlightMap, wordElements],
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

  /* Read the media clock every visible frame, without rendering React at 60Hz.
     timeupdate still owns progress, persistence and the background fallback. */
  useEffect(() => {
    const audio = audioRef.current;
    if (!playing || !effWords || !audio) return;
    let frame: number | null = null;
    let disposed = false;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const renderActiveWordFrame = () => {
      frame = null;
      if (disposed || audio.paused || audio.ended || document.hidden) return;
      if (!seekingBarRef.current && Date.now() >= silenceHighlightUntilRef.current) {
        setActiveWordRef.current(activeWordIndexRef.current(audio.currentTime));
      }
      frame = requestAnimationFrame(renderActiveWordFrame);
    };
    const start = () => {
      if (!disposed && frame === null && !audio.paused && !audio.ended && !document.hidden) {
        frame = requestAnimationFrame(renderActiveWordFrame);
      }
    };
    const onVisibility = () => {
      stop();
      if (!document.hidden) start();
    };
    audio.addEventListener("pause", stop);
    audio.addEventListener("ended", stop);
    audio.addEventListener("error", stop);
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      disposed = true;
      stop();
      audio.removeEventListener("pause", stop);
      audio.removeEventListener("ended", stop);
      audio.removeEventListener("error", stop);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [playing, effWords, syncKey]);

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
          const shouldScroll = (followActiveRef.current || allowScrollOnSeekRef.current) && (!audioRef.current?.paused || allowScrollOnSeekRef.current);
          allowScrollOnSeekRef.current = false;
          if (shouldScroll) {
            const r = el.getBoundingClientRect();
            if (!withinComfortBand(r.top, r.bottom, window.innerHeight)) {
              programmaticScrollUntilRef.current = Date.now() + 1500;
              window.scrollTo({ top: gentleFollowScrollTop(r.top, window.scrollY, window.innerHeight), behavior: scrollBehavior() });
            }
          }
        } else {
          allowScrollOnSeekRef.current = false;
        }
      } else {
        allowScrollOnSeekRef.current = false;
      }
    },
    [current, effWords, playing, timings],
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

  /* زر واحد مشترك (المشغل الكبير والمصغّر): تشغيل ← إيقاف ← تشغيل،
     وعند التوقف المؤقت بسبب تحريك الصفحة يعيد القارئ لمكان القراءة — أو يستأنف
     التتبع في مكانه إذا كان الكلام المسموع ظاهرًا بالفعل على الشاشة. */
  /* تتبّع اتجاه الكلام المسموع أثناء التشغيل ليقود سهم «ارجع للقراءة» */
  useEffect(() => {
    if (!playing) return;
    const update = () => {
      const active = (document.querySelector<HTMLElement>("#article-body .audio-word-active") ?? document.querySelector<HTMLElement>("#article-body .audio-active"));
      if (!active) return;
      const rect = active.getBoundingClientRect();
      setFollowTarget(followTargetDirection(rect.top, rect.bottom, window.innerHeight));
    };
    update();
    const interval = window.setInterval(update, 400);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", update);
    };
  }, [playing]);

  /* «الكلمة مختفية فعلًا» خارج مساحة القراءة بعد استبعاد الشريطين الثابتين —
     وحدها من تُظهر زر «ارجع للقراءة»؛ الاقتراب من الحافة لا يُظهر شيئًا */
  const [wordAway, setWordAway] = useState(false);
  useEffect(() => {
    if (!playing) {
      setWordAway(false);
      return;
    }
    const check = () => {
      const active = (document.querySelector<HTMLElement>("#article-body .audio-word-active") ?? document.querySelector<HTMLElement>("#article-body .audio-active"));
      if (!active) {
        setWordAway(false);
        return;
      }
      const r = active.getBoundingClientRect();
      const bottomChrome =
        (isMobile ? mobileToolbarHeight : 0) + (miniPlayerRef.current?.getBoundingClientRect().height ?? 0) + 12;
      setWordAway(isWordOutOfUsableArea(r.top, r.bottom, window.innerHeight, 12, bottomChrome));
    };
    check();
    const interval = window.setInterval(check, 400);
    window.addEventListener("scroll", check, { passive: true });
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("scroll", check);
    };
  }, [playing, isMobile, mobileToolbarHeight]);

  /* مفتاح «التتبع التلقائي» في المشغل الكبير — التفضيل الوحيد المحفوظ */
  const toggleFollowPref = useCallback(() => {
    const next = !follow;
    setFollow(next);
    setFollowPaused(false);
    followActiveRef.current = next;
    try {
      localStorage.setItem(FOLLOW_KEY, next ? "on" : "off");
    } catch {}
  }, [follow]);

  /* «ارجع للقراءة»: يعيد الكلمة لسطر قراءة مريح — ويستأنف التتبع إن كان مفتوحًا،
     أو يكتفي بالرجوع مرة واحدة إن كان مقفولًا من المفتاح دون قلب التفضيل */
  const returnToWord = useCallback(() => {
    const active = (document.querySelector<HTMLElement>("#article-body .audio-word-active") ?? document.querySelector<HTMLElement>("#article-body .audio-active"));
    if (active) {
      const rect = active.getBoundingClientRect();
      programmaticScrollUntilRef.current = Date.now() + 1500;
      window.scrollTo({
        top: gentleFollowScrollTop(rect.top, window.scrollY, window.innerHeight),
        behavior: scrollBehavior(),
      });
    }
    if (follow) {
      setFollowPaused(false);
      followActiveRef.current = true;
    }
  }, [follow]);

  useEffect(() => {
    followActiveRef.current = follow && !followPaused;
    followRef.current = follow;
  }, [follow, followPaused]);

  /* تحريك القارئ للصفحة بيده (عجلة/لمس/لوحة مفاتيح/سحب شريط التمرير) أثناء التشغيل
     يفكّ التتبع فورًا وبصمت — لا يشدّ القارئ رجوعًا. إن توقف التمرير ~٥ ثوانٍ
     والكلمة ما زالت داخل نطاق الراحة، يستأنف التتبع دون تحريك الصفحة إطلاقًا.
     التمرير البرمجي لا يُحتسب. */
  useEffect(() => {
    if (!playing) return;
    const disengage = () => {
      if (followActiveRef.current) {
        followActiveRef.current = false;
        setFollowPaused(true);
      }
      if (idleReengageRef.current !== null) window.clearTimeout(idleReengageRef.current);
      idleReengageRef.current = window.setTimeout(() => {
        idleReengageRef.current = null;
        if (!followRef.current) return;
        const active = (document.querySelector<HTMLElement>("#article-body .audio-word-active") ?? document.querySelector<HTMLElement>("#article-body .audio-active"));
        if (!active) return;
        const r = active.getBoundingClientRect();
        if (canSilentlyReengage(r.top, r.bottom, window.innerHeight)) {
          setFollowPaused(false);
        }
      }, 5000);
    };
    const onWheel = () => disengage();
    const onTouch = () => disengage();
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) disengage();
    };
    const onScroll = () => {
      if (Date.now() > programmaticScrollUntilRef.current && !seekingBarRef.current) disengage();
    };
    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll);
    };
  }, [playing]);

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
        setFollowPaused(false);
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
      /* Resolve the body at click time: attaching to the element captured at
         effect time silently dies if the body subtree is ever remounted. */
      const body = document.getElementById("article-body");
      if (!body || !body.contains(target)) return;
      const domIdx = Number(target.dataset.wi);
      const mapped = jumpMap ? (jumpMap[domIdx] ?? -1) : domIdx;
      /* Unmapped display words (-1) fall back to the raw index: the plain and
         tashkeel views tokenize identically, so the raw index is the same word
         or its immediate neighbor, and the click never dies. */
      const audioIdx = mapped >= 0 ? mapped : domIdx;
      const word = audioIdx >= 0 && audioIdx < effWords.length ? effWords[audioIdx] : undefined;
      const audio = audioRef.current;
      if (!word || !audio) return;
      /* A deliberate word pick supersedes a pending resume restore; otherwise a
         click before loadedmetadata is stomped back to the saved position. */
      clearedResumeRef.current = true;
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
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
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
        ref={inlinePlayerRef}
        className="overflow-hidden rounded-[1.4rem] border shadow-soft"
        style={{ background: "linear-gradient(120deg, var(--bg-soft), var(--bg))", borderColor: "var(--border)" }}
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
          setControlsOpen(true);
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

      <div className="flex items-center gap-3 p-3.5 sm:px-5 sm:pb-2">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "إيقاف مؤقت" : "استمع للمقال"}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[1rem] shadow-sm transition-transform active:scale-95"
          style={{ background: "linear-gradient(145deg, var(--accent), var(--accent-strong))", color: "#fff" }}
        >
          {playing ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z"/></svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--ink)" }}>استمع للمقال <span className="inline-flex h-4 items-center gap-0.5" style={{ color: "var(--accent)" }} aria-hidden>{[6,12,8,16,10].map((h,i)=><span key={i} className="w-0.5 rounded-full" style={{height:h,background:"currentColor"}} />)}</span></p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-muted)" }}>{sessionActive ? `${fmtTime(current)} / ${fmtTime(duration)}` : resumedFrom > 0 ? `يكمل من ${fmtTime(resumedFrom)} · استمع واقرأ معًا` : `${fmtTime(duration)} · استمع واقرأ معًا`}</p>
        </div>
        <button
          type="button"
          aria-expanded={controlsOpen}
          aria-label={controlsOpen ? "إخفاء أدوات الصوت" : "إظهار أدوات الصوت"}
          onClick={() => setControlsOpen((open) => !open)}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xs transition-colors hover:bg-(--accent-soft) sm:hidden"
          style={{ color: "var(--accent-strong)", borderColor: "var(--border)" }}
        >
          <span className="sr-only">أدوات الصوت</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden><path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>
        </button>
      </div>
      {effWords ? (
        <p className="flex items-center gap-2 border-t px-4 pb-1 pt-2.5 text-[11px] sm:border-0 sm:px-5" style={{ color: "var(--ink-muted)", borderColor: "var(--border)" }}>
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} aria-hidden />
          قراءة متزامنة كلمة بكلمة — انقر أي كلمة ليبدأ الصوت منها
        </p>
      ) : null}
      <div className={`${controlsOpen ? "block" : "hidden"} px-4 pb-3 pt-3 sm:block sm:border-0 sm:px-5 sm:pt-1`} style={{ borderColor: "var(--border)" }}>

      <div className="audio-controls flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
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
        <div className="order-first w-full flex-auto sm:order-none sm:w-auto sm:flex-1">
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
          onClick={toggleFollowPref}
          role="switch"
          aria-checked={follow}
          aria-label="التتبع التلقائي مع الصوت"
          className="order-3 flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-(--accent-soft) sm:order-none"
          style={{ color: follow ? "var(--accent-strong)" : "var(--ink-muted)" }}
        >
          <span>التتبع التلقائي</span>
          <span
            className="relative inline-block h-5 w-8 shrink-0 rounded-full transition-colors duration-300"
            style={{ background: follow ? "var(--accent)" : "var(--border)" }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all duration-300 ease-fluid"
              style={{ right: follow ? "2px" : "18px" }}
            />
          </span>
        </button>
      </div>
      </div>
      </div>

      {miniVisible &&
        createPortal(
          <div dir="ltr" className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40">
            {/* الهاتف: شريط كامل العرض رفيع فوق شريط أدوات القراءة مباشرة —
                الشاشات الكبيرة: كبسولة عائمة مدمجة كما كانت */}
            <div style={{ paddingBottom: isMobile ? `${mobileToolbarHeight}px` : undefined }} className="flex justify-start sm:pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] lg:pl-[max(1.5rem,calc(50%-30.5rem))]">
              <div
                className={`pointer-events-auto flex w-full items-center gap-1 border-t border-(--border) px-2 py-1 backdrop-blur-md transition-all duration-300 max-sm:shadow-none sm:w-auto sm:gap-2.5 sm:rounded-full sm:border sm:border-amber-500/30 sm:px-0 sm:py-2 sm:pl-2 sm:pr-3.5 ${
                  /* الإيقاف المؤقت يهدّئ الظل لا وضوح الأزرار — القارئ يحتاج أزرارًا مقروءة وهو متوقف.
                     على الهاتف الشريط ملتحم بشريط الأدوات بلا ظل حتى لا يبدو سطحًا منفصلًا */
                  playing
                    ? "sm:shadow-2xl sm:hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)]"
                    : "sm:shadow-md"
                }`}
                style={{
                  /* ألوان الموقع نفسها: كريمي فاتح في الوضع الساطع، غامق في الوضع الداكن — والتفاصيل ذهبية.
                     عند الإيقاف خلفية شبه مصمتة حتى لا يتشوش النص خلف الأزرار على الشاشات اللمسية */
                  background: playing
                    ? "color-mix(in srgb, var(--bg) 90%, transparent)"
                    : "color-mix(in srgb, var(--bg) 97%, transparent)",
                  color: "var(--ink)",
                }}
                ref={miniPlayerRef}
                role="group"
                aria-label="التحكم العائم في الصوت"
              >
                <button
                  onClick={toggle}
                  aria-label={playing ? "إيقاف الصوت مؤقتًا" : "متابعة التشغيل"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white transition-transform hover:scale-105 active:scale-95 sm:h-12 sm:w-12 sm:shadow-md"
                >
                  {playing ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
                  ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72c0 .8.87 1.3 1.55.87l10.4-6.86a1 1 0 0 0 0-1.72L9.55 4.27A1 1 0 0 0 8 5.14Z" /></svg>
                  )}
                </button>

                <button
                  onClick={() => skip(-15)}
                  aria-label="إرجاع ١٥ ثانية إلى الخلف"
                  title="إرجاع ١٥ ثانية"
                  className="no-touch-grow flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-(--accent-soft)"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /><text x="12" y="15.3" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="currentColor">١٥</text></svg>
                </button>
                <button
                  onClick={() => skip(15)}
                  aria-label="تقديم ١٥ ثانية إلى الأمام"
                  title="تقديم ١٥ ثانية"
                  className="no-touch-grow flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-(--accent-soft)"
                  style={{ color: "var(--ink-muted)" }}
                >
                  <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden><g transform="scale(-1,1) translate(-24,0)"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" /></g><text x="12" y="15.3" textAnchor="middle" fontSize="7.4" fontWeight="800" fill="currentColor">١٥</text></svg>
                </button>

                <div className="flex min-w-0 flex-1 select-none flex-col items-start gap-1 sm:flex-none">
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
                    className="flex h-4 w-full cursor-pointer touch-none select-none items-center sm:w-24"
                  >
                    <span className="relative block h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                      <span
                        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-75"
                        style={{
                          width: duration ? `${Math.min(100, (current / duration) * 100)}%` : "0%",
                          background: "linear-gradient(90deg, var(--accent-strong), var(--accent))",
                        }}
                      />
                    </span>
                  </div>
                </div>

                {/* لا زر تتبع في الحالة الطبيعية — يظهر «ارجع للقراءة» فقط عندما تختفي الكلمة فعلًا */}
                {wordAway && (followPaused || !follow) && (
                  <button
                    onClick={returnToWord}
                    aria-label={followReturnAriaLabel(followTarget)}
                    title={followReturnAriaLabel(followTarget)}
                    className="no-touch-grow flex h-8 shrink-0 items-center justify-center gap-1 rounded-full bg-amber-500/20 px-1.5 text-[11px] font-bold transition-colors hover:bg-(--accent-soft)"
                    style={{ color: "var(--accent-strong)" }}
                  >
                    <FollowIcon paused target={followTarget} size={17} />
                    <span>{followReturnLabel(followTarget)}</span>
                  </button>
                )}

                <button
                  onClick={cycleRate}
                  aria-label="سرعة التشغيل"
                  title="سرعة التشغيل"
                  className="font-ui no-touch-grow flex h-8 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold tabular-nums transition-colors hover:bg-(--accent-soft)"
                  style={{ color: "var(--accent-strong)" }}
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
                  className="no-touch-grow flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-(--accent-soft)"
                  style={{ color: "var(--ink-muted)" }}
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