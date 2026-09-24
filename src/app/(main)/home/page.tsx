"use client";

import { useState } from "react";
import Link from "next/link";
import { Home as HomeIcon, Plus, Users } from "lucide-react";
import { getRoomIcon } from "@/lib/room-icons";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import { SHARED_ROOM_ID } from "@/lib/sharing";
import { AddRoomDialog } from "@/components/home/add-room-dialog";
import { RoomTemperatureChip } from "@/components/home/hub-live-status";

export default function MyHomePage() {
  const rooms = useRoomsStore((s) => s.rooms);
  const roomsHydrated = useRoomsStore((s) => s.hydrated);
  const roomsError = useRoomsStore((s) => s.error);
  const fetchRooms = useRoomsStore((s) => s.fetchRooms);
  const devices = useDevicesStore((s) => s.devices);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Devices shared one by one have no room of the viewer's own to sit in — they gather here.
  const sharedDeviceCount = devices.filter((d) => d.roomId === SHARED_ROOM_ID).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">My Home</h1>
        <button
          type="button"
          onClick={() => { setDialogOpen(true); }}
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label="Add room"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <Link
        href="/home/room?id=all"
        className="flex items-center gap-4 rounded-2xl bg-brand-gradient px-5 py-5 text-primary-foreground shadow-lg shadow-primary/20"
      >
        <HomeIcon className="size-9" strokeWidth={1.5} />
        <div className="h-8 w-px bg-white/30" />
        <div className="flex flex-col">
          <span className="text-base font-semibold">All Devices</span>
          <span className="text-sm text-white/80">{devices.length} devices</span>
        </div>
      </Link>

      {!roomsHydrated ? (
        <div className="py-14 text-center text-sm text-muted-foreground">Loading your rooms…</div>
      ) : rooms.length === 0 && roomsError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-destructive/40 py-14 text-center">
          <p className="text-sm font-medium">Couldn&apos;t load your rooms</p>
          <p className="max-w-xs px-4 text-xs text-muted-foreground">{roomsError}</p>
          <button
            type="button"
            onClick={() => { void fetchRooms(); }}
            className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Retry
          </button>
        </div>
      ) : rooms.length === 0 && sharedDeviceCount === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-14 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <HomeIcon className="size-6" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">No rooms yet</p>
            <p className="text-xs text-muted-foreground">
              Add your first room to start organizing devices.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setDialogOpen(true); }}
            className="mt-1 rounded-full bg-brand-gradient px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Add a room
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {rooms.map((room) => {
            const Icon = getRoomIcon(room.iconKey);
            const deviceCount = devices.filter((d) => d.roomId === room.id).length;
            return (
              <Link
                key={room.id}
                href={`/home/room?id=${room.id}`}
                className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
              >
                <Icon className={`size-8 ${room.color}`} strokeWidth={1.6} />
                <span className="text-sm font-medium">{room.name}</span>
                <span className="text-xs text-muted-foreground">
                  {deviceCount} devices
                </span>
                {room.access === "room" && (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-medium text-primary">
                    Shared with you
                  </span>
                )}
                <RoomTemperatureChip roomId={room.id} variant="inline" />
              </Link>
            );
          })}
          {sharedDeviceCount > 0 && (
            <Link
              href={`/home/room?id=${SHARED_ROOM_ID}`}
              className="flex flex-col items-center gap-2 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
            >
              <Users className="size-8 text-primary" strokeWidth={1.6} />
              <span className="text-sm font-medium">Shared with me</span>
              <span className="text-xs text-muted-foreground">{sharedDeviceCount} devices</span>
            </Link>
          )}
        </div>
      )}

      <AddRoomDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
