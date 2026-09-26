// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AlarmControlPanel } from "./alarm-control-panel";

function setup(onChange = vi.fn()) {
  render(
    <AlarmControlPanel
      name="Wake up"
      isOn={true}
      alarmTime="07:00"
      alarmDays={["0", "1", "2", "3", "4"]}
      onChange={onChange}
    />
  );
  return { onChange, timeInput: screen.getByDisplayValue("07:00") };
}

describe("AlarmControlPanel: sync debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not report anything on mount", () => {
    const { onChange } = setup();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it("collapses rapid time changes (scrubbing the picker) into a single send", () => {
    const { onChange, timeInput } = setup();

    fireEvent.change(timeInput, { target: { value: "07:01" } });
    fireEvent.change(timeInput, { target: { value: "07:12" } });
    fireEvent.change(timeInput, { target: { value: "07:30" } });
    expect(onChange).not.toHaveBeenCalled(); // still debouncing

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alarmTime: "07:30" }));
  });

  it("a change within the debounce window resets the wait instead of stacking sends", () => {
    const { onChange, timeInput } = setup();

    fireEvent.change(timeInput, { target: { value: "07:15" } });
    act(() => {
      vi.advanceTimersByTime(400); // short of the 700ms debounce
    });
    fireEvent.change(timeInput, { target: { value: "07:20" } });
    act(() => {
      vi.advanceTimersByTime(400); // 800ms since the first edit, but only 400ms since the second
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alarmTime: "07:20" }));
  });

  it("flushes a pending edit immediately when the panel unmounts before the debounce fires", () => {
    const onChange = vi.fn();
    const { unmount } = render(
      <AlarmControlPanel name="Wake up" isOn={true} alarmTime="07:00" alarmDays={["0"]} onChange={onChange} />
    );
    const timeInput = screen.getByDisplayValue("07:00");

    fireEvent.change(timeInput, { target: { value: "07:45" } });
    expect(onChange).not.toHaveBeenCalled();

    unmount();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alarmTime: "07:45" }));
  });

  it("toggling ON/OFF is debounced the same way", () => {
    const { onChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "On" }));
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ isOn: false }));
  });
});
