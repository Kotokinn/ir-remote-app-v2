"use client";

import {
  ChevronLeft,
  Home as HomeIcon,
  Radio,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/home/confirm-dialog";
import {
  HubConnectivityIcon,
  HubTemperature,
  RoomTemperatureChip,
} from "@/components/home/hub-live-status";
import { PhysicalDeviceSheet } from "@/components/home/physical-device-sheet";
import { usePingHubsOnOpen } from "@/lib/device/presence-ping";
import { roomCategories } from "@/lib/mock-data";
import { getRoomIcon } from "@/lib/room-icons";
import { mayEdit, SHARED_ROOM_ID } from "@/lib/sharing";
import { useDevicesStore } from "@/lib/store/devices-store";
import { type PhysicalDevice, useHubsStore } from "@/lib/store/hubs-store";
import { useRoomsStore } from "@/lib/store/rooms-store";

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const hydrated = useRoomsStore((s) => s.hydrated);
  const userRoom = useRoomsStore((s) => s.rooms.find((r) => r.id === roomId));
  const removeRoom = useRoomsStore((s) => s.removeRoom);
  const devices = useDevicesStore((s) => s.devices);
  const removeDevicesByHub = useDevicesStore((s) => s.removeDevicesByHub);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const removePhysicalDevice = useHubsStore((s) => s.removePhysicalDevice);
  const [sheetHub, setSheetHub] = useState<PhysicalDevice | undefined>(
    undefined,
  );
  const [deleteTarget, setDeleteTarget] = useState<PhysicalDevice | undefined>(
    undefined,
  );
  const [deletingRoom, setDeletingRoom] = useState(false);
  const roomHubs =
    roomId === "all"
      ? physicalDevices
      : physicalDevices.filter((d) => d.roomId === roomId);
  usePingHubsOnOpen(roomHubs);

  const room =
    roomId === "all"
      ? {
          id: "all",
          name: t("home.allDevices"),
          icon: HomeIcon,
          color: "text-primary",
        }
      : roomId === SHARED_ROOM_ID
        ? {
            id: SHARED_ROOM_ID,
            name: t("home.sharedWithMe"),
            icon: Users,
            color: "text-primary",
          }
        : userRoom
          ? {
              id: userRoom.id,
              name: userRoom.name,
              icon: getRoomIcon(userRoom.iconKey),
              color: userRoom.color,
            }
          : undefined;

  if (!hydrated) {
    return (
      <div className="px-4 pt-16 text-center text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        <p className="text-sm text-muted-foreground">{t("room.notFound")}</p>
        <Link href="/home" className="text-sm font-medium text-primary">
          {t("room.backHome")}
        </Link>
      </div>
    );
  }

  const categories = roomCategories(devices, roomId);
  const Icon = room.icon;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-5 pb-6 lg:max-w-full lg:px-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>
        {userRoom && userRoom.access === "owner" && (
          <button
            type="button"
            onClick={() => {
              setDeletingRoom(true);
            }}
            aria-label={t("room.deleteRoomAria", { name: userRoom.name })}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-accent">
          <Icon className={`size-7 ${room.color}`} strokeWidth={1.6} />
        </div>
        <h1 className="text-lg font-semibold">{room.name}</h1>
        <RoomTemperatureChip roomId={room.id} variant="pill" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {categories.map((cat) => {
          const CatIcon = cat.icon;
          return (
            <Link
              key={cat.id}
              href={`/home/category?room=${roomId}&category=${cat.id}`}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
            >
              <CatIcon className={`size-7 ${cat.color}`} strokeWidth={1.6} />
              <span className="text-sm font-medium">{t(cat.nameKey)}</span>
              <span className="text-xs text-muted-foreground">
                {t("home.deviceCount", { count: cat.count })}
              </span>
            </Link>
          );
        })}
      </div>

      {roomHubs.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t("room.hubsModules")}
          </h2>
          <div className="flex flex-col gap-2">
            {roomHubs.map((hub) => (
              <div
                key={hub.id}
                className="flex items-center gap-2 rounded-2xl bg-card px-2 py-2 shadow-sm ring-1 ring-border"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (hub.productType === "hub-ir") {
                      router.push(
                        `/home/add-device?room=${roomId}&hub=${hub.id}`,
                      );
                    } else {
                      setSheetHub(hub);
                    }
                  }}
                  className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1 text-start"
                >
                  {hub.productType === "hub-ir" ? (
                    <Radio className="size-5 shrink-0 text-primary" />
                  ) : (
                    <Zap className="size-5 shrink-0 text-primary" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {hub.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {hub.productType === "hub-ir"
                        ? t("room.irHubHint")
                        : t("room.relayModule")}
                    </span>
                  </div>
                </button>
                <HubTemperature hub={hub} />
                <HubConnectivityIcon hub={hub} />
                {mayEdit(hub) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteTarget(hub);
                    }}
                    aria-label={t("room.removeAria", { name: hub.name })}
                    className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <PhysicalDeviceSheet
        open={Boolean(sheetHub)}
        onOpenChange={(open) => {
          if (!open) setSheetHub(undefined);
        }}
        physicalDevice={sheetHub}
        devices={devices}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        title={t("room.removeTitle", {
          name: deleteTarget?.name ?? t("room.thisDevice"),
        })}
        description={
          deleteTarget
            ? t("room.removeDescription", {
                count: devices.filter((d) => d.hubId === deleteTarget.id)
                  .length,
              })
            : undefined
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          removeDevicesByHub(deleteTarget.id);
          void removePhysicalDevice(deleteTarget.id);
        }}
      />

      <ConfirmDialog
        open={deletingRoom}
        onOpenChange={setDeletingRoom}
        title={
          userRoom ? t("room.deleteRoomTitle", { name: userRoom.name }) : ""
        }
        description={
          roomHubs.length > 0
            ? t("room.deleteRoomDescription", { count: roomHubs.length })
            : t("room.deleteRoomDescriptionEmpty")
        }
        onConfirm={() => {
          if (!userRoom) return;
          void removeRoom(userRoom.id);
          router.replace("/home");
        }}
      />
    </div>
  );
}
