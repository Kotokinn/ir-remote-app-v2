// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ColorWheel } from "./color-wheel";

// jsdom has no usable PointerEvent (no clientX/pointerId) and no pointer capture — same polyfill
// used in ac-control-panel.test.tsx / alarm-control-panel.test.tsx for the same reason.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

// The wheel's own math never reads the container's measured size — only its `left`/`top` (jsdom
// defaults those to 0, which is exactly what these tests assume) — so no getBoundingClientRect
// stubbing is needed; clientX/clientY below are already "relative to a wheel at (0,0)".
function drag(el: HTMLElement, points: Array<[number, number]>) {
  const [first, ...rest] = points;
  fireEvent.pointerDown(el, { pointerId: 1, clientX: first[0], clientY: first[1] });
  for (const [x, y] of rest) {
    fireEvent.pointerMove(el, { pointerId: 1, clientX: x, clientY: y });
  }
}

describe("ColorWheel", () => {
  beforeEach(() => {
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("picking the center (no distance from the middle) reports zero saturation — white", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} />);

    drag(screen.getByRole("slider"), [[90, 90]]); // center of the 180x180 wheel

    expect(onChange).toHaveBeenCalledWith("#808080"); // s=0, l=0.5 -> mid gray, not tinted by any hue
  });

  it("picking the top edge (full saturation, 0° hue) reports pure red", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} />);

    drag(screen.getByRole("slider"), [[90, 0]]);

    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("dragging beyond the wheel's edge clamps saturation instead of reporting nonsense", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} />);

    drag(screen.getByRole("slider"), [[90, -500]]); // far above the wheel, same angle as the top-edge case

    expect(onChange).toHaveBeenCalledWith("#ff0000");
  });

  it("reports continuously while dragging, once per move", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} />);

    drag(screen.getByRole("slider"), [
      [90, 90],
      [90, 0],
      [180, 90],
    ]);

    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("stops reporting once the pointer is released", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} />);
    const wheel = screen.getByRole("slider");

    fireEvent.pointerDown(wheel, { pointerId: 1, clientX: 90, clientY: 90 });
    fireEvent.pointerUp(wheel, { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(wheel, { pointerId: 1, clientX: 90, clientY: 0 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not respond to pointer input while disabled", () => {
    const onChange = vi.fn();
    render(<ColorWheel color="#ef4444" onChange={onChange} disabled />);

    drag(screen.getByRole("slider"), [[90, 0]]);

    expect(onChange).not.toHaveBeenCalled();
  });
});
