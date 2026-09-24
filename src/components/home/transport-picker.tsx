"use client";

import { useState } from "react";
import { Cable, Check, Loader2, RefreshCw } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { useHubsStore, type PhysicalDevice, type TransportPreference } from "@/lib/store/hubs-store";
import { listSerialPorts } from "@/lib/device/serial-transport";
import { cn } from "@/lib/utils";

const OPTIONS: Array<{ id: TransportPreference; label: string; description: string }> = [
  { id: "auto", label: "Auto", description: "RS485 if wired, otherwise MQTT or Bluetooth by signal." },
  { id: "mqtt", label: "MQTT only", description: "Always over the network. Fails if the hub is offline." },
  { id: "ble", label: "Bluetooth only", description: "Always over BLE. Fails if out of range." },
  { id: "rs485", label: "RS485 only", description: "Always over the assigned COM port. Fails if unplugged." },
];

/**
 * Lets the user pin a hub to one connection path instead of the automatic choice — useful for
 * telling exactly which path just ran while testing a specific one. Picking anything but "Auto" is
 * a hard pin: that path is tried and only that one, no silent fallback to another (see
 * device-commands.ts) — the point of choosing by hand is knowing for sure which one just ran.
 */
export function TransportPicker({ hub }: { hub: PhysicalDevice }) {
  const updatePhysicalDevice = useHubsStore((s) => s.updatePhysicalDevice);
  const [open, setOpen] = useState(false);
  const [ports, setPorts] = useState<string[]>(hub.serialPort ? [hub.serialPort] : []);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  const current = hub.preferredTransport ?? "auto";
  const options = hub.productType === "relay8" ? OPTIONS : OPTIONS.filter((o) => o.id !== "rs485");

  function scanPorts() {
    setScanning(true);
    setScanError("");
    listSerialPorts()
      .then((found) => {
        setPorts(found);
      })
      .catch((error: unknown) => {
        setScanError(error instanceof Error ? error.message : "Couldn't list COM ports.");
      })
      .finally(() => {
        setScanning(false);
      });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (hub.productType === "relay8") scanPorts();
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70"
        aria-label="Connection method"
      >
        <Cable className="size-4" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Connection method</SheetTitle>
            <SheetDescription>{hub.name}</SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-2">
            {options.map((option) => {
              const active = current === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    void updatePhysicalDevice(hub.id, { preferredTransport: option.id });
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition-colors",
                    active ? "bg-accent ring-primary" : "bg-card ring-border"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}
                  >
                    {active && <Check className="size-3" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {hub.productType === "relay8" && (
            <div className="flex flex-col gap-2 border-t border-border px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">COM port</span>
                <button
                  type="button"
                  onClick={scanPorts}
                  disabled={scanning}
                  className="flex items-center gap-1 text-xs font-medium text-primary disabled:opacity-50"
                >
                  {scanning ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                  Rescan
                </button>
              </div>
              {scanError && <p className="text-xs text-destructive">{scanError}</p>}
              {!scanError && ports.length === 0 && !scanning && (
                <p className="text-xs text-muted-foreground">
                  No COM ports found. Plug in the RS485 adapter, then rescan.
                </p>
              )}
              <select
                value={hub.serialPort ?? ""}
                onChange={(e) => {
                  void updatePhysicalDevice(hub.id, { serialPort: e.target.value || undefined });
                }}
                className="h-10 rounded-xl border border-border bg-background px-3 text-sm outline-none"
              >
                <option value="">Not assigned</option>
                {ports.map((port) => (
                  <option key={port} value={port}>
                    {port}
                  </option>
                ))}
              </select>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
