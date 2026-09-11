"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { FAVORITES, type FavoriteDevice } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { LightControlPanel } from "@/components/devices/light-control-panel";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteDevice[]>(FAVORITES);
  const [openId, setOpenId] = useState<string | null>(null);
  const openDevice = favorites.find((f) => f.id === openId);

  function toggle(id: string) {
    setFavorites((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isOn: !f.isOn } : f))
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Favorites</h1>
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label="Add favorite"
        >
          <Plus className="size-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {favorites.map((device) => {
          const Icon = device.icon;
          return (
            <button
              key={device.id}
              type="button"
              onClick={() => {
                if (device.controllable) {
                  setOpenId(device.id);
                } else {
                  toggle(device.id);
                }
              }}
              className={cn(
                "flex flex-col items-start gap-4 rounded-2xl p-4 text-left shadow-sm transition-colors",
                device.isOn
                  ? "bg-brand-gradient text-primary-foreground"
                  : "bg-card text-foreground ring-1 ring-border"
              )}
            >
              <span
                className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  device.isOn ? "text-white/80" : "text-muted-foreground"
                )}
              >
                {device.isOn ? "ON" : "OFF"}
              </span>
              <Icon className="size-8" strokeWidth={1.6} />
              <span className="text-sm font-medium">{device.name}</span>
            </button>
          );
        })}
      </div>

      <Drawer
        open={Boolean(openDevice)}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
      >
        <DrawerContent className="sm:inset-x-0 sm:bottom-6 sm:mx-auto sm:max-w-md sm:rounded-2xl">
          <DrawerHeader>
            <DrawerTitle className="sr-only">{openDevice?.name}</DrawerTitle>
          </DrawerHeader>
          {openDevice && (
            <div className="px-4 pb-2">
              <LightControlPanel
                key={openDevice.id}
                icon={openDevice.icon}
                name={openDevice.name}
                isOn={openDevice.isOn}
                mode={openDevice.mode}
                intensity={openDevice.intensity}
                colorIndex={openDevice.colorIndex}
              />
            </div>
          )}
          <DrawerFooter>
            <button
              type="button"
              onClick={() => { setOpenId(null); }}
              className="h-11 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground"
            >
              OK
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
