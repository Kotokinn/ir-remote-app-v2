"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { getCategory, type Device } from "@/lib/mock-data";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore, getPhysicalDevice } from "@/lib/store/hubs-store";
import { cn } from "@/lib/utils";
import { LightControlPanel } from "@/components/devices/light-control-panel";
import { AcControlPanel, type AcState } from "@/components/devices/ac-control-panel";
import { RemoteControlPanel } from "@/components/devices/remote-control-panel";
import { AlarmControlPanel } from "@/components/devices/alarm-control-panel";
import { RgbControlPanel, type RgbState } from "@/components/devices/rgb-control-panel";
import { ToggleDeviceRow } from "@/components/devices/toggle-device-row";
import { ConfirmDialog } from "@/components/home/confirm-dialog";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { HubStatusDot, HubTemperatureReadout } from "@/components/home/hub-live-status";
import { buildRgbCommands, buildSendAcCommand } from "@/lib/device/commands";

export function CategoryClient({
  roomId,
  categoryId,
}: {
  roomId: string;
  categoryId: string;
}) {
  const router = useRouter();
  const category = getCategory(categoryId);
  const allDevices = useDevicesStore((s) => s.devices);
  const updateDevice = useDevicesStore((s) => s.updateDevice);
  const removeDevice = useDevicesStore((s) => s.removeDevice);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const devices = allDevices.filter(
    (d) => (roomId === "all" || d.roomId === roomId) && d.categoryId === categoryId
  );
  const [selectedId, setSelectedId] = useState(devices[0]?.id);
  const [deleteTarget, setDeleteTarget] = useState<Device | undefined>(undefined);
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0];
  const allToggle = devices.every((d) => d.kind === "toggle");

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

  function hubNameFor(device: Device) {
    return getPhysicalDevice(physicalDevices, device.hubId)?.name;
  }

  function realDeviceIdFor(device: Device) {
    return getPhysicalDevice(physicalDevices, device.hubId)?.deviceId;
  }

  function handleAcChange(device: Device, state: AcState) {
    updateDevice(device.id, state);
    const deviceId = realDeviceIdFor(device);
    if (!deviceId || !device.brand) return;
    sendDeviceCommand(deviceId, "sendAc", buildSendAcCommand(device.brand, state).params).catch((error: unknown) => {
      console.error("[ac] sendDeviceCommand failed", error);
    });
  }

  function handleRgbChange(device: Device, state: RgbState) {
    updateDevice(device.id, state);
    const deviceId = realDeviceIdFor(device);
    if (!deviceId) return;
    for (const command of buildRgbCommands(state)) {
      sendDeviceCommand(deviceId, command.method, command.params).catch((error: unknown) => {
        console.error("[rgb] sendDeviceCommand failed", error);
      });
    }
  }

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
        <Link
          href={`/home/add-device?room=${roomId}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70"
          aria-label="Add device"
        >
          <Plus className="size-4" />
        </Link>
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
      ) : allToggle ? (
        <div className="flex flex-col gap-2 px-4 lg:px-0">
          {devices.map((device) => (
            <ToggleDeviceRow
              key={device.id}
              icon={category.icon}
              name={device.name}
              isOn={device.isOn}
              hubName={hubNameFor(device)}
              onRemove={() => {
                setDeleteTarget(device);
              }}
            />
          ))}
        </div>
      ) : (
        <>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 lg:px-0">
            {devices.map((device) => {
              const active = device.id === selectedDevice.id;
              const chipHub = getPhysicalDevice(physicalDevices, device.hubId);
              return (
                <button
                  key={device.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(device.id);
                  }}
                  className={cn(
                    "relative flex w-16 shrink-0 flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground ring-1 ring-border"
                  )}
                >
                  {chipHub && (
                    <span className="absolute top-1.5 right-1.5">
                      <HubStatusDot hub={chipHub} />
                    </span>
                  )}
                  <CategoryIcon className="size-5" />
                  <span className="w-full truncate text-[10px] font-medium">
                    {device.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-4 lg:px-0">
            {selectedDevice.kind === "light" && (
              <LightControlPanel
                key={selectedDevice.id}
                icon={category.icon}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                mode={selectedDevice.mode}
                intensity={selectedDevice.intensity}
                colorIndex={selectedDevice.colorIndex}
              />
            )}
            {selectedDevice.kind === "ac" && (
              <AcControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                acMode={selectedDevice.acMode}
                targetTemp={selectedDevice.targetTemp}
                fanSpeed={selectedDevice.fanSpeed}
                swing={selectedDevice.swing}
                hubName={hubNameFor(selectedDevice)}
                currentTempSlot={<HubTemperatureReadout deviceId={realDeviceIdFor(selectedDevice)} />}
                onChange={(state) => {
                  handleAcChange(selectedDevice, state);
                }}
              />
            )}
            {selectedDevice.kind === "remote" && (
              <RemoteControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                buttons={selectedDevice.buttons ?? []}
                hubName={hubNameFor(selectedDevice)}
                onButtonsChange={(buttons) => {
                  updateDevice(selectedDevice.id, { buttons });
                }}
              />
            )}
            {selectedDevice.kind === "toggle" && (
              <ToggleDeviceRow
                key={selectedDevice.id}
                icon={category.icon}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                hubName={hubNameFor(selectedDevice)}
              />
            )}
            {selectedDevice.kind === "rgb" && (
              <RgbControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                intensity={selectedDevice.intensity}
                colorIndex={selectedDevice.colorIndex}
                effect={selectedDevice.effect}
                effectSpeed={selectedDevice.effectSpeed}
                hubName={hubNameFor(selectedDevice)}
                onChange={(state) => {
                  handleRgbChange(selectedDevice, state);
                }}
              />
            )}
            {selectedDevice.kind === "alarm" && (
              <AlarmControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                alarmTime={selectedDevice.alarmTime}
                alarmDays={selectedDevice.alarmDays}
                hubName={hubNameFor(selectedDevice)}
              />
            )}

            <button
              type="button"
              onClick={() => {
                setDeleteTarget(selectedDevice);
              }}
              className="mt-4 flex items-center gap-1.5 text-sm font-medium text-destructive"
            >
              <Trash2 className="size-4" />
              Remove device
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        title={`Remove ${deleteTarget?.name ?? "this device"}?`}
        description="This can't be undone."
        onConfirm={() => {
          if (!deleteTarget) return;
          removeDevice(deleteTarget.id);
        }}
      />
    </div>
  );
}
