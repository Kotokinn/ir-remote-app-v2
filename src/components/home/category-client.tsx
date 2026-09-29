"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getCategory, type Device } from "@/lib/mock-data";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useRoomsStore } from "@/lib/store/rooms-store";
import { canAddDevicesTo, mayConfigure, mayEdit } from "@/lib/sharing";
import { useHubsStore, getPhysicalDevice, type PhysicalDevice } from "@/lib/store/hubs-store";
import { cn } from "@/lib/utils";
import { LightControlPanel } from "@/components/devices/light-control-panel";
import { AcControlPanel, type AcState, type SleepState } from "@/components/devices/ac-control-panel";
import { RemoteControlPanel } from "@/components/devices/remote-control-panel";
import { AlarmControlPanel, type AlarmState } from "@/components/devices/alarm-control-panel";
import { RgbControlPanel, type RgbState } from "@/components/devices/rgb-control-panel";
import { ToggleDeviceRow } from "@/components/devices/toggle-device-row";
import { ConfirmDialog } from "@/components/home/confirm-dialog";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { HubStatusDot, HubTemperatureReadout } from "@/components/home/hub-live-status";
import { buildRgbCommands, buildSendAcCommand, buildSetSleepModeCommand } from "@/lib/device/commands";
import { removeAlarmFromHub, syncAlarmToHub } from "@/lib/device/alarm-sync";
import { TransportPicker } from "@/components/home/transport-picker";
import { useSyncRelayStatusOnOpen } from "@/lib/device/relay-status-sync";

// Physical relays are latching (ADW1212HL — audible click, real wear per toggle) and every flip is
// a real MQTT publish; nothing currently stops a user from mashing a switch and firing one command
// per tap. Debounce the network side only — updateDevice below still applies every tap immediately
// so the Switch itself stays responsive, but only the settled final state after a short pause of no
// further taps actually goes out over the wire.
const TOGGLE_SEND_DEBOUNCE_MS = 300;

export function CategoryClient({
  roomId,
  categoryId,
}: {
  roomId: string;
  categoryId: string;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const category = getCategory(categoryId);
  const allDevices = useDevicesStore((s) => s.devices);
  const updateDevice = useDevicesStore((s) => s.updateDevice);
  const removeDevice = useDevicesStore((s) => s.removeDevice);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const rooms = useRoomsStore((s) => s.rooms);
  const devices = allDevices.filter(
    (d) => (roomId === "all" || d.roomId === roomId) && d.categoryId === categoryId
  );
  const [selectedId, setSelectedId] = useState(devices[0]?.id);
  const [deleteTarget, setDeleteTarget] = useState<Device | undefined>(undefined);
  const [alarmSyncError, setAlarmSyncError] = useState<string | null>(null);
  const pendingToggleSends = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; flush: () => void }>());
  const [lockedToggleIds, setLockedToggleIds] = useState<Set<string>>(new Set());

  // A pending debounced toggle send would otherwise be silently dropped if the user navigates away
  // (e.g. taps a switch then immediately backs out) before the pause elapses — flush instead.
  useEffect(() => {
    const pending = pendingToggleSends.current;
    return () => {
      for (const { timer, flush } of pending.values()) {
        clearTimeout(timer);
        flush();
      }
      pending.clear();
    };
  }, []);
  const selectedDevice = devices.find((d) => d.id === selectedId) ?? devices[0];
  const allToggle = devices.every((d) => d.kind === "toggle");
  // Connection method is a per-hub setting. One hub on screen (the common case) gets its picker
  // right in the header, same as before. Several hubs (e.g. two relay8 modules' channels both
  // filed under "Switches") used to hide it outright — ambiguous which one it'd mean — but that
  // just leaves no way to ever change either one's transport from this screen. Instead, list every
  // distinct hub behind the devices shown here and give each its own picker, named, so it's always
  // clear which hub is being configured.
  const hubsInView = (() => {
    const seen = new Map<string, PhysicalDevice>();
    for (const device of devices) {
      const hub = getPhysicalDevice(physicalDevices, device.hubId);
      if (hub && !seen.has(hub.id)) seen.set(hub.id, hub);
    }
    return [...seen.values()];
  })();
  const commonHub = hubsInView.length === 1 ? hubsInView[0] : undefined;
  const relayStatusSyncing = useSyncRelayStatusOnOpen(hubsInView);

  // TransportPicker pins a hub's preferredTransport persistently (hubs-store, localStorage) — meant
  // for "always use RS485 for this hub", not "just testing BLE for a minute on this screen". Without
  // this, picking anything but Auto here and then navigating away leaves it pinned forever: every
  // other channel on that same hub (e.g. the other 7 relay8 toggles) loses its MQTT-first/BLE-fallback
  // behavior for good, with no UI left open to undo it. So leaving this screen always resets whatever
  // hub(s) it showed back to "auto" — a pick made here is scoped to being on this screen.
  const hubsInViewRef = useRef<PhysicalDevice[]>([]);
  hubsInViewRef.current = hubsInView;
  useEffect(() => {
    return () => {
      const { updatePhysicalDevice } = useHubsStore.getState();
      for (const hub of hubsInViewRef.current) {
        void updatePhysicalDevice(hub.id, { preferredTransport: "auto" });
      }
    };
  }, []);

  if (!category) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        <p className="text-sm text-muted-foreground">{t("category.notFound")}</p>
        <Link href={`/home/room?id=${roomId}`} className="text-sm font-medium text-primary">
          {t("common.back")}
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
    void updateDevice(device.id, state);
    const deviceId = realDeviceIdFor(device);
    if (!deviceId || !device.brand) return;
    sendDeviceCommand(deviceId, "sendAc", buildSendAcCommand(device.brand, state).params).catch((error: unknown) => {
      console.error("[ac] sendDeviceCommand failed", error);
    });
  }

  function handleSleepChange(device: Device, state: SleepState) {
    void updateDevice(device.id, {
      sleepEnabled: state.enabled,
      sleepSubject: state.subject,
      sleepWakeTime: state.wakeTime,
      sleepTargetTemp: state.targetTemp,
    });
    const deviceId = realDeviceIdFor(device);
    if (!deviceId) return;
    sendDeviceCommand(deviceId, "setSleepMode", buildSetSleepModeCommand(state).params).catch(
      (error: unknown) => {
        console.error("[ac] setSleepMode failed", error);
      }
    );
  }

  function handleToggleChange(device: Device, isOn: boolean) {
    void updateDevice(device.id, { isOn });
    const deviceId = realDeviceIdFor(device);
    // relayIndex is only set for a relay8-backed toggle; a plain decorative toggle stays UI-only.
    if (!deviceId || !device.relayIndex) return;

    const existing = pendingToggleSends.current.get(device.id);
    if (existing) clearTimeout(existing.timer);

    const flush = () => {
      pendingToggleSends.current.delete(device.id);
      setLockedToggleIds((prev) => {
        if (!prev.has(device.id)) return prev;
        const next = new Set(prev);
        next.delete(device.id);
        return next;
      });
      sendDeviceCommand(deviceId, `setRelay${device.relayIndex}`, isOn).catch((error: unknown) => {
        console.error("[toggle] setRelay failed", error);
      });
    };
    const timer = setTimeout(flush, TOGGLE_SEND_DEBOUNCE_MS);
    pendingToggleSends.current.set(device.id, { timer, flush });
    setLockedToggleIds((prev) => (prev.has(device.id) ? prev : new Set(prev).add(device.id)));
  }

  function handleAlarmChange(device: Device, state: AlarmState) {
    setAlarmSyncError(null);
    const updated = { ...device, ...state };
    void updateDevice(device.id, state);
    syncAlarmToHub(updated)
      .then((result) => {
        if (!result.ok) setAlarmSyncError(result.message);
      })
      .catch((error: unknown) => {
        console.error("[alarm] sendDeviceCommand failed", error);
      });
  }

  function handleRgbChange(device: Device, state: RgbState) {
    void updateDevice(device.id, state);
    const deviceId = realDeviceIdFor(device);
    if (!deviceId) return;
    for (const command of buildRgbCommands(state)) {
      sendDeviceCommand(deviceId, command.method, command.params).catch((error: unknown) => {
        console.error("[rgb] sendDeviceCommand failed", error);
      });
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pt-5 pb-6 lg:max-w-full lg:px-8">
      <div className="flex items-center gap-2 px-4 lg:px-0">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label={t("common.back")}
        >
          <ChevronLeft className="size-5 rtl:rotate-180" />
        </button>
        <h1 className="flex-1 truncate text-lg font-semibold">{t(category.nameKey)}</h1>
        {commonHub && <TransportPicker hub={commonHub} />}
        {canAddDevicesTo(roomId, rooms) && (
          <Link
            href={`/home/add-device?room=${roomId}`}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/70"
            aria-label={t("category.addDeviceAria")}
          >
            <Plus className="size-4" />
          </Link>
        )}
      </div>

      {hubsInView.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-1 lg:px-0">
          {hubsInView.map((hub) => (
            <div
              key={hub.id}
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted py-1 ps-3 pe-1 text-xs font-medium text-foreground/70"
            >
              <span className="max-w-24 truncate">{hub.name}</span>
              <TransportPicker hub={hub} />
            </div>
          ))}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-10 text-center lg:px-0">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <CategoryIcon className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("category.emptyTitle", { category: t(category.nameKey) })}</p>
          <p className="text-xs text-muted-foreground">
            {t("category.emptyHint")}
          </p>
        </div>
      ) : allToggle ? (
        <div className="relative flex flex-col gap-2 px-4 lg:px-0">
          {relayStatusSyncing && (
            <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl bg-background/70 text-xs font-medium text-muted-foreground backdrop-blur-[1px]">
              <Loader2 className="size-4 animate-spin" />
              {t("category.checkingState")}
            </div>
          )}
          {devices.map((device) => (
            <ToggleDeviceRow
              key={device.id}
              icon={category.icon}
              name={device.name}
              isOn={device.isOn}
              hubName={hubNameFor(device)}
              disabled={lockedToggleIds.has(device.id)}
              onRemove={
                mayEdit(device)
                  ? () => {
                      setDeleteTarget(device);
                    }
                  : undefined
              }
              onChange={(isOn) => {
                handleToggleChange(device, isOn);
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
                    <span className="absolute top-1.5 end-1.5">
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
                sleepEnabled={selectedDevice.sleepEnabled}
                sleepSubject={selectedDevice.sleepSubject}
                sleepWakeTime={selectedDevice.sleepWakeTime}
                sleepTargetTemp={selectedDevice.sleepTargetTemp}
                hubName={hubNameFor(selectedDevice)}
                currentTempSlot={<HubTemperatureReadout deviceId={realDeviceIdFor(selectedDevice)} />}
                onChange={(state) => {
                  handleAcChange(selectedDevice, state);
                }}
                onSleepChange={(state) => {
                  handleSleepChange(selectedDevice, state);
                }}
              />
            )}
            {(selectedDevice.kind === "remote" || selectedDevice.kind === "alarm") &&
              !mayConfigure(selectedDevice) && (
                <p className="rounded-xl bg-muted px-3 py-3 text-sm text-muted-foreground">
                  {t("category.controlOnly", { name: selectedDevice.name })}
                </p>
              )}
            {selectedDevice.kind === "remote" && mayConfigure(selectedDevice) && (
              <RemoteControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                buttons={selectedDevice.buttons ?? []}
                hubName={hubNameFor(selectedDevice)}
                onButtonsChange={(buttons) => {
                  void updateDevice(selectedDevice.id, { buttons });
                }}
              />
            )}
            {selectedDevice.kind === "toggle" && (
              <div className="relative">
                {relayStatusSyncing && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-2xl bg-background/70 text-xs font-medium text-muted-foreground backdrop-blur-[1px]">
                    <Loader2 className="size-4 animate-spin" />
                    {t("category.checkingState")}
                  </div>
                )}
                <ToggleDeviceRow
                  key={selectedDevice.id}
                  icon={category.icon}
                  name={selectedDevice.name}
                  isOn={selectedDevice.isOn}
                  hubName={hubNameFor(selectedDevice)}
                  disabled={lockedToggleIds.has(selectedDevice.id)}
                  onChange={(isOn) => {
                    handleToggleChange(selectedDevice, isOn);
                  }}
                />
              </div>
            )}
            {selectedDevice.kind === "rgb" && (
              <RgbControlPanel
                key={selectedDevice.id}
                name={selectedDevice.name}
                isOn={selectedDevice.isOn}
                intensity={selectedDevice.intensity}
                color={selectedDevice.color}
                effect={selectedDevice.effect}
                effectSpeed={selectedDevice.effectSpeed}
                hubName={hubNameFor(selectedDevice)}
                onChange={(state) => {
                  handleRgbChange(selectedDevice, state);
                }}
              />
            )}
            {selectedDevice.kind === "alarm" && mayConfigure(selectedDevice) && (
              <>
                {alarmSyncError && (
                  <p className="mb-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {alarmSyncError}
                  </p>
                )}
                <AlarmControlPanel
                  key={selectedDevice.id}
                  name={selectedDevice.name}
                  isOn={selectedDevice.isOn}
                  alarmTime={selectedDevice.alarmTime}
                  alarmDays={selectedDevice.alarmDays}
                  hubName={hubNameFor(selectedDevice)}
                  onChange={(state) => {
                    handleAlarmChange(selectedDevice, state);
                  }}
                />
              </>
            )}

            {mayEdit(selectedDevice) && (
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget(selectedDevice);
                }}
                className="mt-4 flex items-center gap-1.5 text-sm font-medium text-destructive"
              >
                <Trash2 className="size-4" />
                {t("category.removeDevice")}
              </button>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(undefined);
        }}
        title={t("room.removeTitle", { name: deleteTarget?.name ?? t("room.thisDevice") })}
        description={t("common.cannotUndo")}
        onConfirm={() => {
          if (!deleteTarget) return;
          // The alarm's schedule lives on the hub itself (setSchedule/NVS); removing only the app's
          // copy would leave a ghost alarm ringing on the hardware forever.
          if (deleteTarget.kind === "alarm") {
            removeAlarmFromHub(deleteTarget).catch(() => undefined);
          }
          void removeDevice(deleteTarget.id);
        }}
      />
    </div>
  );
}
