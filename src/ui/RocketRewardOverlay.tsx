"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSceneStore } from "@/lib/store";
import { pauseAmbientForVideo, resumeAmbientAfterVideo } from "./MuteButton";

// Video reward that plays when the player has completed every mission
// and interacts with the rocket. File is expected at
// /public/videos/rocket-reward.mp4 — the deploy step drops it in
// separately since it's a ~20MB binary we don't check into git.
const VIDEO_SRC = "/videos/rocket-reward.mp4";

// Skip button appears after this many ms so the player at least sees
// the opening beat.
const SKIP_DELAY_MS = 2000;

export function RocketRewardOverlay() {
  const showing = useSceneStore((s) => s.showingRocketReward);
  const hide = useSceneStore((s) => s.hideRocketReward);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Video sound is ON by default; the ambient BGM is ducked while the
  // overlay is showing, so the two never talk over each other.
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showSkip, setShowSkip] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Reveal the skip button after SKIP_DELAY_MS while the overlay is
  // visible. Reset on close so a re-open starts the timer over.
  // Also ducks the game music while the video plays and restores it
  // (respecting the user's SOUND pill) when the overlay closes.
  useEffect(() => {
    if (!showing) {
      setShowSkip(false);
      setMuted(false);
      setPaused(false);
      return;
    }
    pauseAmbientForVideo();
    const t = window.setTimeout(() => setShowSkip(true), SKIP_DELAY_MS);
    return () => {
      window.clearTimeout(t);
      resumeAmbientAfterVideo(useSceneStore.getState().muted);
    };
  }, [showing]);

  // Kick off playback with sound. Opening the overlay always follows a
  // user gesture (E key / tap), so sound-on autoplay is normally allowed —
  // but if the browser refuses anyway, fall back to muted playback.
  useEffect(() => {
    if (!showing) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play().catch(() => {
      setMuted(true);
      v.muted = true;
      void v.play();
    });
  }, [showing]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play();
    else v.pause();
  };

  const dismiss = () => {
    hide();
    setShowToast(true);
    window.setTimeout(() => setShowToast(false), 5000);
  };

  return (
    <>
      <AnimatePresence>
        {showing && (
          <motion.div
            key="rocket-reward"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
            onClick={dismiss}
          >
            <div
              className="relative w-full max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={videoRef}
                src={VIDEO_SRC}
                autoPlay
                muted={muted}
                playsInline
                onEnded={dismiss}
                onPlay={() => setPaused(false)}
                onPause={() => setPaused(true)}
                onClick={togglePlay}
                className="w-full h-full bg-black object-contain cursor-pointer"
              />
              {/* Big center ▶ while paused — tap anywhere on the video to resume */}
              {paused && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="rounded-full border border-white/25 bg-black/55 backdrop-blur w-16 h-16 flex items-center justify-center text-2xl">
                    ▶
                  </div>
                </div>
              )}
              <div className="absolute top-3 left-3 flex gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="rounded-full border border-white/20 bg-black/50 backdrop-blur px-3 py-1.5 text-xs font-mono opacity-80 hover:opacity-100 transition"
                >
                  {paused ? "▶ play" : "⏸ pause"}
                </button>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className="rounded-full border border-white/20 bg-black/50 backdrop-blur px-3 py-1.5 text-xs font-mono opacity-80 hover:opacity-100 transition"
                >
                  {muted ? "🔇 unmute" : "🔊 mute"}
                </button>
              </div>
              <AnimatePresence>
                {showSkip && (
                  <motion.button
                    key="skip"
                    type="button"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={dismiss}
                    className="absolute top-3 right-3 rounded-full border border-white/20 bg-black/50 backdrop-blur px-3 py-1.5 text-xs font-mono opacity-80 hover:opacity-100 transition"
                  >
                    skip · Esc
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showToast && (
          <motion.div
            key="explored-toast"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4 }}
            className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 z-40"
          >
            <div className="rounded-full border border-emerald-300/40 bg-emerald-400/10 backdrop-blur px-5 py-2 text-sm text-emerald-100">
              You explored everything on the moon 🚀
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
