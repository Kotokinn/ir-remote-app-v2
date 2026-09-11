"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Home as HomeIcon } from "lucide-react";
import { roomCategories } from "@/lib/mock-data";
import { getRoomIcon } from "@/lib/room-icons";
import { useRoomsStore } from "@/lib/store/rooms-store";

export function RoomClient({ roomId }: { roomId: string }) {
  const router = useRouter();
  const hydrated = useRoomsStore((s) => s.hydrated);
  const userRoom = useRoomsStore((s) => s.rooms.find((r) => r.id === roomId));

  const room =
    roomId === "all"
      ? { id: "all", name: "All Devices", icon: HomeIcon, color: "text-primary" }
      : userRoom
        ? { id: userRoom.id, name: userRoom.name, icon: getRoomIcon(userRoom.iconKey), color: userRoom.color }
        : undefined;

  if (!hydrated) {
    return <div className="px-4 pt-16 text-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (!room) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        <p className="text-sm text-muted-foreground">Room not found.</p>
        <Link href="/home" className="text-sm font-medium text-primary">
          Back to My Home
        </Link>
      </div>
    );
  }

  const categories = roomCategories(roomId);
  const Icon = room.icon;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-5 pb-6 lg:px-8">
      <button
        type="button"
        onClick={() => { router.back(); }}
        className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
        aria-label="Go back"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div className="flex flex-col items-center gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-accent">
          <Icon className={`size-7 ${room.color}`} strokeWidth={1.6} />
        </div>
        <h1 className="text-lg font-semibold">{room.name}</h1>
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
              <span className="text-sm font-medium">{cat.name}</span>
              <span className="text-xs text-muted-foreground">
                {cat.count} device{cat.count === 1 ? "" : "s"}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
