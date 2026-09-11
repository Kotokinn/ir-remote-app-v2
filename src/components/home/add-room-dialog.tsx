"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ROOM_ICON_OPTIONS, type RoomIconKey } from "@/lib/room-icons";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { cn } from "@/lib/utils";

export function AddRoomDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addRoom = useRoomsStore((s) => s.addRoom);
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState<RoomIconKey>(ROOM_ICON_OPTIONS[0].key);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addRoom(name, iconKey);
    setName("");
    setIconKey(ROOM_ICON_OPTIONS[0].key);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setName("");
      }}
    >
      <DialogContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Add a room</DialogTitle>
            <DialogDescription>
              Give your room a name and pick an icon.
            </DialogDescription>
          </DialogHeader>

          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder="e.g. Bedroom"
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />

          <div className="grid grid-cols-4 gap-2">
            {ROOM_ICON_OPTIONS.map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setIconKey(key); }}
                aria-label={label}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-3 text-[11px] transition-colors",
                  iconKey === key
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                {label}
              </button>
            ))}
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
            >
              Add room
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
