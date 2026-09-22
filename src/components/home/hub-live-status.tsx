"use client";

import { Thermometer, Wifi, WifiOff } from "lucide-react";
import type { PhysicalDevice } from "@/lib/store/hubs-store";
import {
  formatTemperature,
  useHubConnectivity,
  useHubLink,
  useHubTemperature,
  useRoomTemperature,
  type HubLinkKind,
} from "@/lib/device/hub-live";
import { cn } from "@/lib/utils";

export function HubConnectivityIcon({ hub }: { hub: PhysicalDevice }) {
  const state = useHubConnectivity(hub);
  if (state === "offline") {
    return <WifiOff className="size-4 shrink-0 text-destructive" aria-label="Offline" />;
  }
  if (state === "unknown") {
    return <Wifi className="size-4 shrink-0 animate-pulse text-muted-foreground" aria-label="Connecting" />;
  }
  return <Wifi className="size-4 shrink-0 text-emerald-600" aria-label="Online" />;
}

/** Temperature reading for one hub row; renders nothing for products without a sensor. */
export function HubTemperature({ hub }: { hub: PhysicalDevice }) {
  const isSensorHub = hub.productType === "hub-ir" && Boolean(hub.deviceId);
  const celsius = useHubTemperature(isSensorHub ? hub.deviceId : undefined);
  if (!isSensorHub) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground"
      title="Measured at the hub"
    >
      <Thermometer className="size-3.5" />
      {formatTemperature(celsius)}
    </span>
  );
}

/**
 * Room temperature (average of the room's hubs). Renders nothing if the room has no paired hub,
 * so rooms without a sensor don't show a permanent "—".
 */
export function RoomTemperatureChip({
  roomId,
  variant,
}: {
  roomId: string;
  variant: "pill" | "inline";
}) {
  const { hasSensor, celsius } = useRoomTemperature(roomId);
  if (!hasSensor) return null;
  return (
    <span
      title="Measured at the hub in this room"
      className={cn(
        "flex items-center gap-1 tabular-nums",
        variant === "pill"
          ? "rounded-full bg-muted px-3 py-1 text-sm font-medium text-foreground/80"
          : "text-xs font-medium text-muted-foreground"
      )}
    >
      <Thermometer className={variant === "pill" ? "size-4" : "size-3.5"} />
      {formatTemperature(celsius)}
    </span>
  );
}

/** Shown under the AC setpoint: what the hub controlling this AC is measuring right now. */
export function HubTemperatureReadout({ deviceId }: { deviceId: string | undefined }) {
  const celsius = useHubTemperature(deviceId);
  if (!deviceId) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Measured at the hub">
      <Thermometer className="size-3.5" />
      Now {formatTemperature(celsius)}
    </span>
  );
}

const LINK_STYLE: Record<HubLinkKind, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-emerald-500" },
  bluetooth: { label: "Bluetooth", dot: "bg-sky-500" },
  offline: { label: "Offline", dot: "bg-destructive" },
  connecting: { label: "Connecting…", dot: "animate-pulse bg-muted-foreground" },
};

/** Small status dot for a hub (e.g. on a device chip). */
export function HubStatusDot({ hub }: { hub: PhysicalDevice }) {
  const { kind } = useHubLink(hub);
  return (
    <span
      role="img"
      aria-label={LINK_STYLE[kind].label}
      title={`${hub.name} · ${LINK_STYLE[kind].label}`}
      className={cn("block size-2.5 rounded-full ring-2 ring-background", LINK_STYLE[kind].dot)}
    />
  );
}
