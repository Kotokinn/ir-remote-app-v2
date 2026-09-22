// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RgbControlPanel } from "./rgb-control-panel";

// jsdom has no usable PointerEvent — same polyfill as color-wheel.test.tsx.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

function setup(onChange = vi.fn()) {
  render(<RgbControlPanel name="Strip" isOn={true} color="#ef4444" onChange={onChange} />);
  return { onChange };
}

describe("RgbControlPanel: color picker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("does not report anything on mount", () => {
    const { onChange } = setup();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("picking a preset shade reports that hex after the debounce", () => {
    const { onChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Shade 4" })); // SHADE_COLORS[3] = "#a855f7"
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: "#a855f7" }));
  });

  it("collapses a drag across the color wheel into a single send", () => {
    const { onChange } = setup();
    const wheel = screen.getByRole("slider", { name: "Color wheel" });

    fireEvent.pointerDown(wheel, { pointerId: 1, clientX: 90, clientY: 90 });
    fireEvent.pointerMove(wheel, { pointerId: 1, clientX: 90, clientY: 45 });
    fireEvent.pointerMove(wheel, { pointerId: 1, clientX: 90, clientY: 0 }); // ends at the top edge
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: "#ff0000" }));
  });

  it("flushes a pending wheel pick immediately when the panel unmounts before the debounce fires", () => {
    const onChange = vi.fn();
    const { unmount } = render(<RgbControlPanel name="Strip" isOn={true} color="#ef4444" onChange={onChange} />);

    fireEvent.pointerDown(screen.getByRole("slider", { name: "Color wheel" }), {
      pointerId: 1,
      clientX: 90,
      clientY: 0,
    });
    expect(onChange).not.toHaveBeenCalled();

    unmount();

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ color: "#ff0000" }));
  });

  it("shows the current color's hex, and disables the wheel while the light is off", () => {
    render(<RgbControlPanel name="Strip" isOn={false} color="#123456" />);

    expect(screen.getByText("#123456")).toBeTruthy();
    expect(screen.getByRole("slider", { name: "Color wheel" }).getAttribute("aria-disabled")).toBe("true");
  });
});
