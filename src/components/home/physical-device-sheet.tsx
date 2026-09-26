"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCategory, type Device } from "@/lib/mock-data";
import type { PhysicalDevice } from "@/lib/store/hubs-store";
import { useRoomsStore } from "@/lib/store/rooms-store";

export function PhysicalDeviceSheet({
  open,
  onOpenChange,
  physicalDevice,
  devices,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  physicalDevice: PhysicalDevice | undefined;
  devices: Device[];
}) {
  const { t } = useTranslation();
  const rooms = useRoomsStore((s) => s.rooms);
  const childDevices = devices.filter((d) => d.hubId === physicalDevice?.id);

  function roomName(roomId: string) {
    if (roomId === "all") return t("home.allDevices");
    return rooms.find((r) => r.id === roomId)?.name ?? t("room.unknown");
  }

  return (
    <Sheet open={open && Boolean(physicalDevice)} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80dvh] rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {physicalDevice?.name}
            {physicalDevice?.online ? (
              <Wifi className="size-4 text-emerald-600" />
            ) : (
              <WifiOff className="size-4 text-destructive" />
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {childDevices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("room.noChannels")}</p>
          ) : (
            childDevices.map((device) => {
              const category = getCategory(device.categoryId);
              return (
                <div
                  key={device.id}
                  className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5"
                >
                  {category && (
                    <category.icon className={`size-4 shrink-0 ${category.color}`} />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{device.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {roomName(device.roomId)} · {category ? t(category.nameKey) : ""}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
