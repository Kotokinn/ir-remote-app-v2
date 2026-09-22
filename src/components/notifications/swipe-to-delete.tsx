"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SLIDE_OUT_MS = 200;
const DRAG_START_PX = 6;

/**
 * Wraps a row so it can be dismissed by dragging it sideways (either direction): past the
 * threshold it slides out and {@link onDelete} is called; short of it, it springs back. Works with
 * touch and mouse. Vertical panning stays with the browser (`touch-action: pan-y`), so the list
 * still scrolls. Delete/Backspace on the focused row is the keyboard equivalent.
 */
export function SwipeToDelete({
  onDelete,
  children,
  className,
}: {
  onDelete: () => void;
  children: ReactNode;
  className?: string;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; pointerId: number } | null>(null);
  const moved = useRef(false);

  // An unlaid-out row reports width 0; fall back to a phone-sized width so thresholds stay sane.
  function rowWidth(): number {
    const width = container.current?.offsetWidth ?? 0;
    return width > 0 ? width : 320;
  }

  function slideOutThenDelete(direction: 1 | -1) {
    const width = rowWidth();
    setLeaving(true);
    setOffset(direction * width);
    window.setTimeout(onDelete, SLIDE_OUT_MS);
  }

  function endDrag(cancelled: boolean) {
    if (!start.current) return;
    start.current = null;
    setDragging(false);

    const width = rowWidth();
    const threshold = Math.min(110, width * 0.35);
    if (!cancelled && moved.current && Math.abs(offset) >= threshold) {
      slideOutThenDelete(offset > 0 ? 1 : -1);
    } else {
      setOffset(0);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (leaving || (event.pointerType === "mouse" && event.button !== 0)) return;
    start.current = { x: event.clientX, pointerId: event.pointerId };
    moved.current = false;
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const origin = start.current;
    if (!origin || origin.pointerId !== event.pointerId) return;
    const dx = event.clientX - origin.x;
    if (!moved.current) {
      if (Math.abs(dx) < DRAG_START_PX) return;
      moved.current = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(dx);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (leaving) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      slideOutThenDelete(1);
    }
  }

  return (
    <div ref={container} className={cn("relative", className)}>
      {offset !== 0 && (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center rounded-2xl bg-destructive px-5 text-white",
            offset > 0 ? "justify-start" : "justify-end"
          )}
        >
          <Trash2 className="size-5" />
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          endDrag(false);
        }}
        onPointerCancel={() => {
          endDrag(true);
        }}
        onKeyDown={onKeyDown}
        // A drag must not also count as a tap on the row (e.g. "mark as read"). `moved` is reset on
        // the next pointer-down, so a drag that produces no click cannot swallow a later tap.
        onClickCapture={(event) => {
          if (moved.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        style={{
          transform: `translateX(${offset}px)`,
          opacity: leaving ? 0 : 1,
          touchAction: "pan-y",
        }}
        className={cn("relative select-none", !dragging && "transition-[transform,opacity] duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
