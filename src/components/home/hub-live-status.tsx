"use client";

import { Thermometer, Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PhysicalDevice } from "@/lib/store/hubs-store";
import {
  formatTemperature,
  useHubConnectivity,
  useHubLink,
  useHubTemperature,
  useRoomTemperature,
  type HubLinkKind,
} from "@/lib/device/hub-live";
import type { TKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function HubConnectivityIcon({ hub }: { hub: PhysicalDevice }) {
  const { t } = useTranslation();
  const state = useHubConnectivity(hub);
  if (state === "offline") {
    return <WifiOff className="size-4 shrink-0 text-destructive" aria-label={t("hubLive.offline")} />;
  }
  if (state === "unknown") {
    return <Wifi className="size-4 shrink-0 animate-pulse text-muted-foreground" aria-label={t("hubLive.connecting")} />;
  }
  return <Wifi className="size-4 shrink-0 text-emerald-600" aria-label={t("hubLive.online")} />;
}

/** Temperature reading for one hub row; renders nothing for products without a sensor. */
export function HubTemperature({ hub }: { hub: PhysicalDevice }) {
  const { t } = useTranslation();
  const isSensorHub = hub.productType === "hub-ir" && Boolean(hub.deviceId);
  const celsius = useHubTemperature(isSensorHub ? hub.deviceId : undefined);
  if (!isSensorHub) return null;
  return (
    <span
      className="flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground"
      title={t("hubLive.measuredAtHub")}
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
  const { t } = useTranslation();
  const { hasSensor, celsius } = useRoomTemperature(roomId);
  if (!hasSensor) return null;
  return (
    <span
      title={t("hubLive.measuredInRoom")}
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
  const { t } = useTranslation();
  const celsius = useHubTemperature(deviceId);
  if (!deviceId) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground" title={t("hubLive.measuredAtHub")}>
      <Thermometer className="size-3.5" />
      {t("hubLive.now", { temp: formatTemperature(celsius) })}
    </span>
  );
}

const LINK_STYLE: Record<HubLinkKind, { labelKey: TKey; dot: string }> = {
  online: { labelKey: "hubLive.online", dot: "bg-emerald-500" },
  bluetooth: { labelKey: "hubLive.bluetooth", dot: "bg-sky-500" },
  offline: { labelKey: "hubLive.offline", dot: "bg-destructive" },
  connecting: { labelKey: "hubLive.connecting", dot: "animate-pulse bg-muted-foreground" },
};

/** Small status dot for a hub (e.g. on a device chip). */
export function HubStatusDot({ hub }: { hub: PhysicalDevice }) {
  const { t } = useTranslation();
  const { kind } = useHubLink(hub);
  const label = t(LINK_STYLE[kind].labelKey);
  return (
    <span
      role="img"
      aria-label={label}
      title={`${hub.name} · ${label}`}
      className={cn("block size-2.5 rounded-full ring-2 ring-background", LINK_STYLE[kind].dot)}
    />
  );
}
