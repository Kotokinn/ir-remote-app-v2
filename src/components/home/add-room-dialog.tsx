"use client";

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const addRoom = useRoomsStore((s) => s.addRoom);
  const [name, setName] = useState("");
  const [iconKey, setIconKey] = useState<RoomIconKey>(ROOM_ICON_OPTIONS[0].key);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    void addRoom(name, iconKey);
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
            <DialogTitle>{t("addRoom.title")}</DialogTitle>
            <DialogDescription>
              {t("addRoom.description")}
            </DialogDescription>
          </DialogHeader>

          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); }}
            placeholder={t("addRoom.placeholder")}
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />

          <div className="grid grid-cols-4 gap-2">
            {ROOM_ICON_OPTIONS.map(({ key, icon: Icon, labelKey }) => (
              <button
                key={key}
                type="button"
                onClick={() => { setIconKey(key); }}
                aria-label={t(labelKey)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-3 text-[11px] transition-colors",
                  iconKey === key
                    ? "border-primary bg-accent text-primary"
                    : "border-border text-muted-foreground"
                )}
              >
                <Icon className="size-5" />
                {t(labelKey)}
              </button>
            ))}
          </div>

          <DialogFooter>
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-11 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
            >
              {t("addRoom.submit")}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
