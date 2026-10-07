"use client";

import { RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;
const MAX_PULL = 96;
const CAPTURE_AFTER = 8;

async function defaultRefresh() {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

// Touch events, not pointer events: on mobile the browser starts a native pan after a few px and then
// fires pointercancel, so pointermove stops and the indicator never grows. A non-passive touchmove can
// preventDefault the native scroll while the user pulls down from the top.
export function PullToRefresh({
  children,
  onRefresh = defaultRefresh,
  className,
}: {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onRefreshRef = useRef(onRefresh);
  const trackingRef = useRef(false);
  const capturedRef = useRef(false);
  const startYRef = useRef(0);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const setPullValue = (value: number) => {
      pullRef.current = value;
      setPull(value);
    };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || el.scrollTop > 0) return;
      trackingRef.current = true;
      capturedRef.current = false;
      startYRef.current = e.touches[0].clientY;
    };

    const onMove = (e: TouchEvent) => {
      if (!trackingRef.current) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (el.scrollTop > 0 || delta <= 0) {
        setPullValue(0);
        return;
      }
      if (!capturedRef.current && delta > CAPTURE_AFTER) {
        capturedRef.current = true;
        setDragging(true);
      }
      if (capturedRef.current) {
        if (e.cancelable) e.preventDefault();
        setPullValue(Math.min(delta * 0.5, MAX_PULL));
      }
    };

    const onEnd = () => {
      if (!trackingRef.current) return;
      trackingRef.current = false;
      capturedRef.current = false;
      setDragging(false);

      if (pullRef.current >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        setPullValue(THRESHOLD * 0.8);
        void Promise.resolve(onRefreshRef.current()).finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setPullValue(0);
        });
      } else {
        setPullValue(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex-1 overflow-y-auto overscroll-y-contain",
        dragging && "select-none",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden",
          !dragging && "transition-[height] duration-300 ease-out",
        )}
        style={{ height: pull }}
      >
        <RefreshCw
          className={cn("size-5 text-primary", refreshing && "animate-spin")}
          style={
            refreshing
              ? undefined
              : {
                  transform: `rotate(${(pull / THRESHOLD) * 360}deg)`,
                  opacity: Math.min(pull / THRESHOLD, 1),
                }
          }
        />
      </div>
      {children}
    </div>
  );
}
