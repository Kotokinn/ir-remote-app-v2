"use client";

import { useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { getCategory, SHADE_COLORS, type Device, type DeviceKind, type SceneAction } from "@/lib/mock-data";
import { LightControlPanel, type LightState } from "@/components/devices/light-control-panel";
import { AcControlPanel, type AcState } from "@/components/devices/ac-control-panel";
import { RgbControlPanel, type RgbState } from "@/components/devices/rgb-control-panel";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const ELIGIBLE_KINDS: DeviceKind[] = ["toggle", "light", "ac", "rgb"];

type Patch = SceneAction["patch"];

function defaultPatch(device: Device): Patch {
  switch (device.kind) {
    case "light":
      return {
        isOn: true,
        mode: device.mode ?? "day",
        intensity: device.intensity ?? 70,
        colorIndex: device.colorIndex ?? 3,
      };
    case "ac":
      return {
        isOn: true,
        acMode: device.acMode ?? "cool",
        targetTemp: device.targetTemp ?? 24,
        fanSpeed: device.fanSpeed ?? "auto",
        swing: device.swing ?? "auto",
      };
    case "rgb":
      return {
        isOn: true,
        intensity: device.intensity ?? 70,
        color: device.color ?? SHADE_COLORS[0],
        effect: device.effect ?? "solid",
        effectSpeed: device.effectSpeed ?? 3,
      };
    default:
      return { isOn: true };
  }
}

function DeviceEditor({
  device,
  patch,
  onChange,
}: {
  device: Device;
  patch: Patch;
  onChange: (patch: Patch) => void;
}) {
  if (device.kind === "light") {
    const category = getCategory(device.categoryId);
    return (
      <LightControlPanel
        icon={category ? category.icon : Lightbulb}
        name={device.name}
        isOn={patch.isOn ?? true}
        mode={patch.mode}
        intensity={patch.intensity}
        colorIndex={patch.colorIndex}
        onChange={(state: LightState) => {
          onChange(state);
        }}
      />
    );
  }
  if (device.kind === "ac") {
    return (
      <AcControlPanel
        name={device.name}
        isOn={patch.isOn ?? true}
        acMode={patch.acMode}
        targetTemp={patch.targetTemp}
        fanSpeed={patch.fanSpeed}
        swing={patch.swing}
        onChange={(state: AcState) => {
          onChange(state);
        }}
      />
    );
  }
  if (device.kind === "rgb") {
    return (
      <RgbControlPanel
        name={device.name}
        isOn={patch.isOn ?? true}
        intensity={patch.intensity}
        color={patch.color}
        effect={patch.effect}
        effectSpeed={patch.effectSpeed}
        onChange={(state: RgbState) => {
          onChange(state);
        }}
      />
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">Turn on</span>
      <Switch
        checked={patch.isOn ?? true}
        onCheckedChange={(v) => {
          onChange({ isOn: v });
        }}
      />
    </div>
  );
}

export function SceneDeviceEditor({
  initialActions,
  onActionsChange,
}: {
  initialActions: SceneAction[];
  onActionsChange: (actions: SceneAction[]) => void;
}) {
  const devices = useDevicesStore((s) => s.devices).filter((d) =>
    ELIGIBLE_KINDS.includes(d.kind)
  );
  const rooms = useRoomsStore((s) => s.rooms);
  const [patches, setPatches] = useState<Map<string, Patch>>(() => {
    const map = new Map<string, Patch>();
    for (const action of initialActions) map.set(action.deviceId, action.patch);
    return map;
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function commit(next: Map<string, Patch>) {
    setPatches(next);
    onActionsChange(
      Array.from(next.entries()).map(([deviceId, patch]) => ({ deviceId, patch }))
    );
  }

  function toggleSelected(device: Device, checked: boolean) {
    const next = new Map(patches);
    if (checked) {
      next.set(device.id, defaultPatch(device));
      setExpandedId(device.id);
    } else {
      next.delete(device.id);
      if (expandedId === device.id) setExpandedId(null);
    }
    commit(next);
  }

  function roomName(roomId: string) {
    if (roomId === "all") return "All Devices";
    return rooms.find((r) => r.id === roomId)?.name ?? "Unknown room";
  }

  if (devices.length === 0) {
    return (
      <p className="px-1 text-sm text-muted-foreground">
        No eligible devices yet — add a light, AC, RGB light, or switch first.
      </p>
    );
  }

  const grouped = new Map<string, Device[]>();
  for (const device of devices) {
    const list = grouped.get(device.roomId) ?? [];
    list.push(device);
    grouped.set(device.roomId, list);
  }

  return (
    <div className="flex flex-col gap-4">
      {Array.from(grouped.entries()).map(([roomId, roomDevices]) => (
        <div key={roomId} className="flex flex-col gap-2">
          <span className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {roomName(roomId)}
          </span>
          {roomDevices.map((device) => {
            const category = getCategory(device.categoryId);
            const patch = patches.get(device.id);
            const selected = patch !== undefined;
            const expanded = expandedId === device.id;
            return (
              <div
                key={device.id}
                className="rounded-2xl bg-card shadow-sm ring-1 ring-border"
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {category && (
                    <category.icon className={cn("size-5 shrink-0", category.color)} />
                  )}
                  <span className="flex-1 truncate text-sm font-medium">{device.name}</span>
                  {selected && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpandedId(expanded ? null : device.id);
                      }}
                      className="text-muted-foreground"
                      aria-label={expanded ? "Collapse" : "Expand"}
                    >
                      <ChevronDown
                        className={cn("size-4 transition-transform", expanded && "rotate-180")}
                      />
                    </button>
                  )}
                  <Switch
                    checked={selected}
                    onCheckedChange={(checked) => {
                      toggleSelected(device, checked);
                    }}
                  />
                </div>
                {selected && expanded && (
                  <div className="border-t border-border px-4 py-4">
                    <DeviceEditor
                      device={device}
                      patch={patch}
                      onChange={(next) => {
                        commit(new Map(patches).set(device.id, next));
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
