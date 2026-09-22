"use client";

import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";

const SIZE = 180; // px — both the canvas resolution and the displayed size.

// Hue = angle around the wheel (0° at the top, matching the fallback conic-gradient this replaced),
// saturation = distance from the center, lightness fixed at 50% so every pickable color is vivid —
// the separate "Brightness" slider is what actually dims the LEDs, this only ever picks a hue/tint.
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Inverse of the wheel's own mapping, used only to place the cursor. A color the wheel itself never
 * produced (a preset swatch, or anything with a lightness other than 50%) still gets a sensible
 * hue/saturation position — it just won't look identical to the wheel's ring at that spot, since the
 * wheel is drawn at a fixed lightness and this color may not be.
 */
function hexToHueSat(hex: string): { h: number; s: number } {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!match) return { h: 0, s: 0 };
  const r = parseInt(match[1], 16) / 255;
  const g = parseInt(match[2], 16) / 255;
  const b = parseInt(match[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s };
}

/**
 * A circular hue/saturation picker, like the color wheel on a real remote or lighting app — drag
 * anywhere on it to pick a color. Reports continuously while dragging (the caller is expected to
 * debounce before sending it anywhere real, same as a slider).
 */
export function ColorWheel({
  color,
  onChange,
  disabled,
}: {
  color: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  // The wheel image itself never depends on the selected color (only the cursor does) — draw once.
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const radius = SIZE / 2;
    const image = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const index = (y * SIZE + x) * 4;
        if (dist > radius) {
          image.data[index + 3] = 0; // transparent outside the circle
          continue;
        }
        const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        const saturation = Math.min(1, dist / radius);
        const [r, g, b] = hslToRgb(hue, saturation, 0.5);
        image.data[index] = r;
        image.data[index + 1] = g;
        image.data[index + 2] = b;
        image.data[index + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, []);

  const { h, s } = useMemo(() => hexToHueSat(color), [color]);
  const radius = SIZE / 2;
  const angle = ((h - 90) * Math.PI) / 180;
  const cursorX = radius + Math.cos(angle) * s * radius;
  const cursorY = radius + Math.sin(angle) * s * radius;

  function pickAt(clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = clientX - rect.left - radius;
    const dy = clientY - rect.top - radius;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
    const saturation = Math.min(1, dist / radius);
    onChange(hslToHex(hue, saturation, 0.5));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    pickAt(event.clientX, event.clientY);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging.current) return;
    pickAt(event.clientX, event.clientY);
  }

  function endDrag() {
    dragging.current = false;
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      role="slider"
      aria-label="Color wheel"
      aria-disabled={disabled}
      aria-valuetext={color}
      className={cn(
        "relative shrink-0 touch-none rounded-full select-none",
        disabled && "pointer-events-none opacity-40"
      )}
      style={{ width: SIZE, height: SIZE }}
    >
      <canvas ref={canvasRef} width={SIZE} height={SIZE} className="rounded-full" />
      <div
        aria-hidden
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
        style={{ left: cursorX, top: cursorY, backgroundColor: color, boxShadow: "0 0 0 1px rgba(0,0,0,0.35)" }}
      />
    </div>
  );
}
