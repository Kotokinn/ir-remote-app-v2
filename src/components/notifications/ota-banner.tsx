"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useOtaStore } from "@/lib/store/ota-store";
import { sendDeviceCommand } from "@/lib/device/device-commands";

/**
 * Live, ephemeral OTA prompts — not persisted server-side notifications (unlike everything else on
 * this page). smart-control announces firmwareAvailable/otaStarted/otaSuccess/otaFailed on its
 * `events` MQTT topic (see main.cpp's publishOtaEvent) and only while the app is actually watching
 * (mqtt-service's SSE stream); nothing is missed while the app is closed though, since the firmware
 * re-announces firmwareAvailable on every OTA check it's still pending (TB_OTA_CHECK_INTERVAL_MS).
 * The version sent back in confirmOtaUpdate is always exactly the newVersion this same event carried
 * — never hand-entered — so it can't drift from what the device actually offered.
 */
export function OtaBanners() {
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const events = useOtaStore((s) => s.events);
  const dismiss = useOtaStore((s) => s.dismiss);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const rows = physicalDevices.flatMap((hub) => {
    const deviceId = hub.deviceId;
    const event = deviceId ? (events as Partial<typeof events>)[deviceId] : undefined;
    return deviceId && event ? [{ hub, deviceId, event }] : [];
  });

  if (rows.length === 0) return null;

  function confirm(deviceId: string, version: string) {
    setSendingId(deviceId);
    sendDeviceCommand(deviceId, "confirmOtaUpdate", { version })
      .catch((error: unknown) => {
        console.error("[ota] confirmOtaUpdate failed", error);
      })
      .finally(() => {
        setSendingId((current) => (current === deviceId ? null : current));
      });
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map(({ hub, deviceId, event }) => {
        const sending = sendingId === deviceId;
        return (
          <div
            key={deviceId}
            className="flex items-start gap-3 rounded-2xl bg-accent px-4 py-3 shadow-sm ring-1 ring-primary/20"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
              {event.type === "otaStarted" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-semibold">{hub.name}</span>

              {event.type === "firmwareAvailable" && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Firmware {event.newVersion} is available (current {event.currentVersion}).
                  </p>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      confirm(deviceId, event.newVersion);
                    }}
                    className="mt-1 w-fit rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {sending ? "Starting…" : "Update now"}
                  </button>
                </>
              )}

              {event.type === "otaStarted" && (
                <p className="text-xs text-muted-foreground">Updating to {event.newVersion}…</p>
              )}

              {event.type === "otaSuccess" && (
                <>
                  <p className="text-xs text-muted-foreground">Updated to {event.newVersion}.</p>
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(deviceId);
                    }}
                    className="mt-1 w-fit text-xs font-medium text-primary"
                  >
                    Dismiss
                  </button>
                </>
              )}

              {event.type === "otaFailed" && (
                <>
                  <p className="text-xs text-destructive">Update to {event.newVersion} failed.</p>
                  <button
                    type="button"
                    disabled={sending}
                    onClick={() => {
                      confirm(deviceId, event.newVersion);
                    }}
                    className="mt-1 w-fit rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {sending ? "Retrying…" : "Retry"}
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
