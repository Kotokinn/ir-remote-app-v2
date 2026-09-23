"use client";

import { useState } from "react";
import { AlertCircle, Zap } from "lucide-react";
import { CATEGORIES, type CategoryId, type Device } from "@/lib/mock-data";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { useHubsStore, getPhysicalDevice } from "@/lib/store/hubs-store";
import { sendDeviceCommand } from "@/lib/device/device-commands";

interface RelayRow {
  name: string;
  categoryId: CategoryId;
  roomId: string;
  tested: boolean;
  error: string;
}

function newDeviceId(index: number) {
  return `dev-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 5)}`;
}

// Pulses the relay ON then OFF — the module is a latching relay (ADW1212HL, holds its physical
// position with no power), so a real "test" needs a visible/audible click, not just a state change
// nothing shows for. Long enough to hear, short enough it doesn't look like the row got left on.
const TEST_PULSE_MS = 900;

export function RelaySetup({
  roomId,
  hubId,
  onDone,
}: {
  roomId: string;
  hubId: string;
  onDone: (devices: Device[]) => void;
}) {
  const rooms = useRoomsStore((s) => s.rooms);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const hubDeviceId = getPhysicalDevice(physicalDevices, hubId)?.deviceId;
  const defaultRoomId = roomId !== "all" ? roomId : (rooms[0]?.id ?? "");
  const [rows, setRows] = useState<RelayRow[]>(
    Array.from({ length: 8 }, (_, i) => ({
      name: `Relay ${i + 1}`,
      categoryId: "switches",
      roomId: defaultRoomId,
      tested: false,
      error: "",
    }))
  );
  const [testingIndex, setTestingIndex] = useState<number | null>(null);

  function updateRow(index: number, patch: Partial<RelayRow>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function testRow(index: number) {
    if (!hubDeviceId) {
      updateRow(index, { error: "This hub isn't paired over the network yet." });
      return;
    }
    setTestingIndex(index);
    updateRow(index, { error: "" });
    const relay = index + 1;
    try {
      await sendDeviceCommand(hubDeviceId, `setRelay${relay}`, true);
      await new Promise((resolve) => {
        setTimeout(resolve, TEST_PULSE_MS);
      });
      await sendDeviceCommand(hubDeviceId, `setRelay${relay}`, false);
      updateRow(index, { tested: true });
    } catch (error) {
      updateRow(index, {
        error: error instanceof Error ? error.message : "Couldn't reach the relay module.",
      });
    } finally {
      setTestingIndex(null);
    }
  }

  function finish() {
    const devices: Device[] = rows.map((row, i) => ({
      id: newDeviceId(i),
      name: row.name.trim() || `Relay ${i + 1}`,
      roomId: row.roomId || defaultRoomId,
      categoryId: row.categoryId,
      isOn: false,
      kind: "toggle",
      hubId,
      relayIndex: i + 1,
    }));
    onDone(devices);
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm text-muted-foreground">
        Name each of the 8 channels and pick where they belong.
      </p>

      <div className="flex flex-col gap-3">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
            <div className="flex items-center gap-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                <Zap className="size-4" />
              </span>
              <input
                value={row.name}
                onChange={(e) => { updateRow(i, { name: e.target.value }); }}
                className="h-9 flex-1 rounded-lg border border-border px-2.5 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={() => { void testRow(i); }}
                disabled={testingIndex === i}
                className="h-9 shrink-0 rounded-lg bg-muted px-3 text-xs font-semibold text-foreground/70 disabled:opacity-60"
              >
                {testingIndex === i ? "…" : row.tested ? "Tested ✓" : "Test"}
              </button>
            </div>
            {row.error && (
              <p className="flex items-start gap-1.5 pl-10 text-[11px] text-destructive">
                <AlertCircle className="mt-0.5 size-3 shrink-0" />
                {row.error}
              </p>
            )}
            <div className="flex gap-2 pl-10">
              <select
                value={row.categoryId}
                onChange={(e) => { updateRow(i, { categoryId: e.target.value as CategoryId }); }}
                className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none"
              >
                {Object.values(CATEGORIES).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={row.roomId}
                onChange={(e) => { updateRow(i, { roomId: e.target.value }); }}
                className="h-8 flex-1 rounded-lg border border-border bg-background px-2 text-xs outline-none"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={finish}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
      >
        Finish setup
      </button>
    </div>
  );
}
