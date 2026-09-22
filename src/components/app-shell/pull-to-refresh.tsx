"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 64;
const MAX_PULL = 96;
const CAPTURE_AFTER = 8;

async function defaultRefresh() {
  await new Promise((resolve) => setTimeout(resolve, 500));
}

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
  const startY = useRef<number | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const capturedRef = useRef(false);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (refreshing) return;
    if ((containerRef.current?.scrollTop ?? 0) > 0) return;
    startY.current = e.clientY;
    pointerIdRef.current = e.pointerId;
    capturedRef.current = false;
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (startY.current === null) return;
    const delta = e.clientY - startY.current;
    if (delta <= 0 || (containerRef.current?.scrollTop ?? 0) > 0) {
      setPull(0);
      return;
    }
    if (!capturedRef.current && delta > CAPTURE_AFTER && pointerIdRef.current !== null) {
      capturedRef.current = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(pointerIdRef.current);
    }
    setPull(Math.min(delta * 0.5, MAX_PULL));
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (pointerIdRef.current === null) return;
    if (capturedRef.current) {
      e.currentTarget.releasePointerCapture(pointerIdRef.current);
    }
    startY.current = null;
    pointerIdRef.current = null;
    capturedRef.current = false;
    setDragging(false);

    if (pull >= THRESHOLD) {
      setRefreshing(true);
      setPull(THRESHOLD * 0.8);
      void Promise.resolve(onRefresh()).finally(() => {
        setRefreshing(false);
        setPull(0);
      });
    } else {
      setPull(0);
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={cn(
        "flex-1 overflow-y-auto overscroll-y-contain",
        dragging && "select-none",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center overflow-hidden",
          !dragging && "transition-[height] duration-300 ease-out"
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
