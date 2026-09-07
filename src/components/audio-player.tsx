"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { easternDigits } from "@/lib/utils";

type Cue = { t: number; id: string };
type BlockMeta = { id: string; words: number };

function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${easternDigits(m)}:${easternDigits(String(s).padStart(2, "0"))}`;
}

/**
 * المشغل الصوتي فائق الذكاء — تشغيل القراءة الصوتية مع إبراز
 * الفقرة المقروءة آنيًا (توقيتات يدوية عبر audioCues أو توزيع تناسبي
 * بعدد كلمات الفقرات).
 */
export function AudioPlayer({
  src,
  durationSec,
  cues,
  blocks,
}: {
  src: string;
  durationSec: number | null;
  cues: Cue[] | null;
  blocks: BlockMeta[];
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [rate, setRate] = useState(1);
  const [follow, setFollow] = useState(true);

  /* خريطة توقيتات الفقرات: يدوية أو تناسبية بالكلمات */
  const timings = useMemo(() => {
    const totalWords = blocks.reduce((a, b) => a + b.words, 0) || 1;
    const dur = duration || durationSec || 0;

    if (cues && cues.length > 0) {
      const map = new Map<string, number>();
      for (const c of cues) map.set(c.id, c.t);
      return map;
    }

    const map = new Map<string, number>();
    let acc = 0;
    for (const b of blocks) {
      map.set(b.id, dur * (acc / totalWords));
      acc += b.words;
    }
    return map;
  }, [cues, blocks, duration, durationSec]);

  /* إبراز الفقرة الحالية */
  useEffect(() => {
    if (!playing && current === 0) return;
    const entries = [...timings.entries()].sort((a, b) => a[1] - b[1]);
    let activeId: string | null = null;
    for (const [id, t] of entries) {
      if (current + 0.35 >= t) activeId = id;
      else break;
    }
    document.querySelectorAll(".audio-active").forEach((el) => el.classList.remove("audio-active"));
    if (activeId) {
      const el = document.getElementById(activeId);
      if (el) {
        el.classList.add("audio-active");
        if (follow) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }, [current, playing, timings, follow]);

  const clearHighlight = useCallback(() => {
    document.querySelectorAll(".audio-active").forEach((el) => el.classList.remove("audio-active"));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, []);

  const skip = useCallback((delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min((duration || 0) - 0.5, audio.currentTime + delta));
  }, [duration]);

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
    setCurrent(audio.currentTime);
  }, []);

  const seekFromBar = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = 1 - (e.clientX - rect.left) / rect.width; // RTL
    audio.currentTime = Math.max(0, Math.min(duration - 0.2, ratio * duration));
  }, [duration]);

  return (
    <div
      className="rounded-2xl border p-4 shadow-soft"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      dir="rtl"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          clearHighlight();
        }}
        onError={clearHighlight}
      />

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
          title="تتبع الفقرة المقروءة تلقائيًا"
          aria-pressed={follow}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12l7 7 7-7" /></svg>
        </button>
      </div>
    </div>
  );
}
