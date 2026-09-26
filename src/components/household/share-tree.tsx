"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { InviteTarget } from "@/lib/api/smart";
import type { Device } from "@/lib/mock-data";
import type { UserRoom } from "@/lib/store/rooms-store";
import { cn } from "@/lib/utils";

/** Rooms hold their devices. A room checked = the whole room (and everything later added to it); otherwise pick devices one by one. */
const NO_ROOM = "no-room";

function Checkbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={(element) => {
        if (element) element.indeterminate = indeterminate;
      }}
      onChange={onChange}
      className="size-4 shrink-0 accent-[var(--primary)] disabled:opacity-60"
    />
  );
}

export function ShareTree({
  rooms,
  devices,
  busy,
  onShare,
}: {
  /** Only rooms the signed-in account owns. */
  rooms: UserRoom[];
  /** Only devices the signed-in account owns. */
  devices: Device[];
  busy: boolean;
  /** Resolves true when the invite was made, so the selection can be cleared. */
  onShare: (targets: InviteTarget[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [selectedRooms, setSelectedRooms] = useState<Set<string>>(new Set());
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const roomIds = new Set(rooms.map((room) => room.id));
  const groups = [
    ...rooms.map((room) => ({
      id: room.id,
      name: room.name,
      isRoom: true,
      devices: devices.filter((device) => device.roomId === room.id),
    })),
    {
      id: NO_ROOM,
      name: t("household.notInRoom"),
      isRoom: false,
      devices: devices.filter((device) => !roomIds.has(device.roomId)),
    },
  ].filter((group) => group.isRoom || group.devices.length > 0);

  const count = selectedRooms.size + selectedDevices.size;

  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function toggleRoom(group: (typeof groups)[number]) {
    const selecting = !selectedRooms.has(group.id);
    setSelectedRooms((current) => toggle(current, group.id));
    // Devices inside a room shared whole are covered by it — don't leave them ticked separately.
    if (selecting) {
      setSelectedDevices((current) => new Set([...current].filter((id) => !group.devices.some((d) => d.id === id))));
    }
  }

  async function share() {
    const targets: InviteTarget[] = [
      ...[...selectedRooms].map((roomId) => ({ scope: "ROOM" as const, roomId })),
      ...[...selectedDevices].map((deviceId) => ({ scope: "DEVICE" as const, deviceId: Number(deviceId) })),
    ];
    if (await onShare(targets)) {
      setSelectedRooms(new Set());
      setSelectedDevices(new Set());
    }
  }

  if (groups.length === 0) {
    return <p className="rounded-2xl bg-card px-4 py-3 text-xs text-muted-foreground shadow-sm ring-1 ring-border">{t("household.addFirst")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col divide-y divide-border rounded-2xl bg-card shadow-sm ring-1 ring-border">
        {groups.map((group) => {
          const roomSelected = group.isRoom && selectedRooms.has(group.id);
          const someDevicePicked = group.devices.some((device) => selectedDevices.has(device.id));
          const open = !collapsed.has(group.id);
          return (
            <div key={group.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                {group.isRoom ? (
                  <Checkbox
                    checked={roomSelected}
                    indeterminate={!roomSelected && someDevicePicked}
                    label={t("household.shareRoomAria", { name: group.name })}
                    onChange={() => {
                      toggleRoom(group);
                    }}
                  />
                ) : (
                  <span className="size-4 shrink-0" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCollapsed((current) => toggle(current, group.id));
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  aria-expanded={open}
                >
                  <span className="truncate text-sm font-medium">{group.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t("home.deviceCount", { count: group.devices.length })}
                  </span>
                  <span className="flex-1" />
                  {open ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                </button>
              </div>
              {open &&
                group.devices.map((device) => (
                  <label
                    key={device.id}
                    className={cn(
                      "flex items-center gap-3 border-t border-border/60 py-2.5 pe-4 ps-11 text-sm",
                      roomSelected && "text-muted-foreground"
                    )}
                  >
                    <Checkbox
                      checked={roomSelected || selectedDevices.has(device.id)}
                      disabled={roomSelected}
                      label={t("household.shareDeviceAria", { name: device.name })}
                      onChange={() => {
                        setSelectedDevices((current) => toggle(current, device.id));
                      }}
                    />
                    <span className="truncate">{device.name}</span>
                  </label>
                ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        disabled={count === 0 || busy}
        onClick={() => {
          void share();
        }}
        className="flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {count === 0 ? t("household.pickToShare") : t("household.shareSelected", { count })}
      </button>
    </div>
  );
}
