// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SwipeToDelete } from "./swipe-to-delete";

function setup() {
  const onDelete = vi.fn();
  const onTap = vi.fn();
  render(
    <SwipeToDelete onDelete={onDelete}>
      <button type="button" onClick={onTap}>
        Hub offline
      </button>
    </SwipeToDelete>
  );
  // The gesture handlers sit on the row's wrapper, the parent of the button.
  const row = screen.getByRole("button", { name: "Hub offline" }).parentElement!;
  return { row, onDelete, onTap };
}

/** A pointer drag from x=200 by `dx` pixels, released. jsdom has no layout, so the row is 320px wide. */
function drag(row: HTMLElement, dx: number, { cancel = false } = {}) {
  fireEvent.pointerDown(row, { pointerId: 1, clientX: 200, pointerType: "touch" });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: 200 + dx / 2, pointerType: "touch" });
  fireEvent.pointerMove(row, { pointerId: 1, clientX: 200 + dx, pointerType: "touch" });
  if (cancel) fireEvent.pointerCancel(row, { pointerId: 1 });
  else fireEvent.pointerUp(row, { pointerId: 1, clientX: 200 + dx });
}

// jsdom has no usable PointerEvent (no clientX/pointerId); a MouseEvent carrying the extra fields is
// enough for the handlers under test.
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

describe("SwipeToDelete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    // jsdom does not implement pointer capture.
    Element.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([
    ["right", 200],
    ["left", -200],
  ])("swiping far enough to the %s deletes the row after it slides out", (_side, dx) => {
    const { row, onDelete } = setup();

    drag(row, dx);
    expect(onDelete).not.toHaveBeenCalled(); // still animating out
    expect(row.style.opacity).toBe("0");

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("a short swipe springs back and deletes nothing", () => {
    const { row, onDelete } = setup();

    drag(row, 40);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("translateX(0px)");
    expect(row.style.opacity).toBe("1");
  });

  it("a cancelled drag (the browser took over for scrolling) never deletes", () => {
    const { row, onDelete } = setup();

    drag(row, 250, { cancel: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onDelete).not.toHaveBeenCalled();
    expect(row.style.transform).toBe("translateX(0px)");
  });

  it("the row follows the finger while dragging", () => {
    const { row } = setup();

    fireEvent.pointerDown(row, { pointerId: 1, clientX: 200, pointerType: "touch" });
    fireEvent.pointerMove(row, { pointerId: 1, clientX: 260, pointerType: "touch" });

    expect(row.style.transform).toBe("translateX(60px)");
  });

  it("a drag does not count as a tap on the row, but a later real tap still does", () => {
    const { row, onTap } = setup();
    const button = screen.getByRole("button", { name: "Hub offline" });

    drag(row, 40);
    fireEvent.click(button); // the click a browser fires after the drag ends
    expect(onTap).not.toHaveBeenCalled();

    fireEvent.pointerDown(row, { pointerId: 2, clientX: 200, pointerType: "touch" });
    fireEvent.pointerUp(row, { pointerId: 2, clientX: 200 });
    fireEvent.click(button);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("Delete on the focused row deletes it too", () => {
    const { onDelete } = setup();

    fireEvent.keyDown(screen.getByRole("button", { name: "Hub offline" }), { key: "Delete" });
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not delete twice when swiped again while sliding out", () => {
    const { row, onDelete } = setup();

    drag(row, 200);
    drag(row, 200);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
