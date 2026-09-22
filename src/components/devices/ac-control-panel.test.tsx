// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AcControlPanel } from "./ac-control-panel";

function setup(onSleepChange = vi.fn()) {
  render(
    <AcControlPanel
      name="Living room AC"
      isOn={true}
      acMode="cool"
      targetTemp={24}
      fanSpeed="auto"
      swing="auto"
      sleepEnabled={false}
      onSleepChange={onSleepChange}
    />
  );
  return { onSleepChange };
}

describe("AcControlPanel: swing cycles like a remote button", () => {
  it("each press steps to the next position and wraps around", () => {
    render(<AcControlPanel name="AC" isOn={true} swing="auto" />);
    const swingButton = screen.getByRole("button", { name: "Swing" });

    expect(swingButton.textContent).toContain("Auto"); // starts at the initial prop
    fireEvent.click(swingButton);
    expect(swingButton.textContent).toContain("Highest");
    fireEvent.click(swingButton);
    expect(swingButton.textContent).toContain("Middle");
    fireEvent.click(swingButton);
    expect(swingButton.textContent).toContain("Lowest");
    fireEvent.click(swingButton);
    expect(swingButton.textContent).toContain("Auto"); // wraps back around
  });
});

describe("AcControlPanel: sleep mode debounce and sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("does not report anything on mount", () => {
    const { onSleepChange } = setup();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onSleepChange).not.toHaveBeenCalled();
  });

  it("enabling sends the current subject and wake time after the debounce", () => {
    const { onSleepChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Sleep mode" }));
    expect(onSleepChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onSleepChange).toHaveBeenCalledTimes(1);
    expect(onSleepChange).toHaveBeenCalledWith({ enabled: true, subject: "adult", wakeTime: "06:00" });
  });

  it("collapses rapid picks (subject then wake time) into a single send", () => {
    const { onSleepChange } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Sleep mode" })); // enable
    fireEvent.click(screen.getByRole("button", { name: "Child" }));
    fireEvent.change(screen.getByDisplayValue("06:00"), { target: { value: "05:30" } });
    expect(onSleepChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(onSleepChange).toHaveBeenCalledTimes(1);
    expect(onSleepChange).toHaveBeenCalledWith({ enabled: true, subject: "child", wakeTime: "05:30" });
  });

  it("flushes a pending edit immediately when the panel unmounts before the debounce fires", () => {
    const onSleepChange = vi.fn();
    const { unmount } = render(
      <AcControlPanel name="AC" isOn={true} sleepEnabled={false} onSleepChange={onSleepChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Sleep mode" }));
    expect(onSleepChange).not.toHaveBeenCalled();

    unmount();

    expect(onSleepChange).toHaveBeenCalledTimes(1);
    expect(onSleepChange).toHaveBeenCalledWith({ enabled: true, subject: "adult", wakeTime: "06:00" });
  });

  it("changing mode/fan/swing/temp while sleeping cancels sleep locally, matching the device's own auto-cancel", () => {
    const onSleepChange = vi.fn();
    render(
      <AcControlPanel name="AC" isOn={true} acMode="cool" sleepEnabled={true} onSleepChange={onSleepChange} />
    );

    fireEvent.click(screen.getByRole("button", { name: "Heat" }));
    act(() => {
      vi.advanceTimersByTime(700);
    });

    // The sleep toggle should now read OFF, and that local cancellation should itself be reported.
    expect(screen.getByRole("button", { name: "Sleep mode" }).textContent).toBe("OFF");
    expect(onSleepChange).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("the Sleep toggle is disabled while the AC itself is off", () => {
    render(<AcControlPanel name="AC" isOn={false} />);

    const toggle = screen.getByRole("button", { name: "Sleep mode" });
    expect(toggle.getAttribute("disabled")).not.toBeNull();
  });

  it("target temp defaults to the subject's default until customized, then can be reset", () => {
    const { onSleepChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Sleep mode" })); // enable, subject=adult -> default 25°

    const useDefaultButton = screen.getByRole("button", { name: "Default (25°)" });
    fireEvent.click(useDefaultButton); // switch to a custom value, starting from the default
    fireEvent.click(screen.getByRole("button", { name: "Increase sleep temperature" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase sleep temperature" }));

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onSleepChange).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "adult", targetTemp: 27 })
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onSleepChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetTemp: undefined })
    );
  });

  it("switching subject changes the shown default without touching a custom temp already set", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Sleep mode" }));

    fireEvent.click(screen.getByRole("button", { name: "Child" }));
    expect(screen.getByRole("button", { name: "Default (27°)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Default (27°)" }));
    fireEvent.click(screen.getByRole("button", { name: "Elder" }));
    // Now customized at 27 (child's default) — switching subject must not silently change it.
    expect(screen.queryByRole("button", { name: /^Default/ })).toBeNull();
    expect(screen.getByText("27°")).toBeTruthy();
  });
});
