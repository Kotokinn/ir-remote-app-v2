"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus } from "lucide-react";
import { categoryDevices, getCategory } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { LightControlPanel } from "@/components/devices/light-control-panel";
import { ToggleDeviceRow } from "@/components/devices/toggle-device-row";

export function CategoryClient({
  roomId,
  categoryId,
}: {
  roomId: string;
  categoryId: string;
}) {
  const router = useRouter();
  const category = getCategory(categoryId);
  const devices = categoryDevices(roomId, categoryId);
  const [selectedId, setSelectedId] = useState(devices[0]?.id);
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0];

  if (!category) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        <p className="text-sm text-muted-foreground">Category not found.</p>
        <Link href={`/home/room?id=${roomId}`} className="text-sm font-medium text-primary">
          Back
        </Link>
      </div>
    );
  }

  const CategoryIcon = category.icon;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-5 pb-6">
      <div className="flex items-center gap-2 px-4 lg:px-0">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label="Go back"
        >
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold">{category.name}</h1>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label="Add device"
        >
          <Plus className="size-4" />
        </button>
      </div>

      {devices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-10 text-center lg:px-0">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <CategoryIcon className="size-6" />
          </span>
          <p className="text-sm font-medium">No {category.name.toLowerCase()} devices yet</p>
          <p className="text-xs text-muted-foreground">
            Tap the + button to add a device to this category.
          </p>
        </div>
      ) : categoryId === "lighting" ? (
        <>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 lg:px-0">
            {devices.map((device) => {
              const DeviceIcon = device.icon;
              const active = device.id === selectedDevice.id;
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(device.id);
                  }}
                  className={cn(
                    "flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground ring-1 ring-border"
                  )}
                >
                  <DeviceIcon className="size-5" />
                  <span className="w-full truncate text-[10px] font-medium">
                    {device.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-4 lg:px-0">
            <LightControlPanel
              key={selectedDevice.id}
              icon={selectedDevice.icon}
              name={selectedDevice.name}
              isOn={selectedDevice.isOn}
              mode={selectedDevice.mode}
              intensity={selectedDevice.intensity}
              colorIndex={selectedDevice.colorIndex}
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2 px-4 lg:px-0">
          {devices.map((device) => (
            <ToggleDeviceRow
              key={device.id}
              icon={device.icon}
              name={device.name}
              isOn={device.isOn}
            />
          ))}
        </div>
      )}
    </div>
  );
}
