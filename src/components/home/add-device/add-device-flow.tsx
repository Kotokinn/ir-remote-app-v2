"use client";

import { X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AcSetup } from "@/components/home/add-device/ac-setup";
import { AlarmSetup } from "@/components/home/add-device/alarm-setup";
import { BleProvisioning } from "@/components/home/add-device/ble-provisioning";
import { HubFunctionChoice } from "@/components/home/add-device/hub-function-choice";
import { NativeFunctionSetup } from "@/components/home/add-device/native-function-setup";
import { ProductPicker } from "@/components/home/add-device/product-picker";
import { RelaySetup } from "@/components/home/add-device/relay-setup";
import { RemoteSetup } from "@/components/home/add-device/remote-setup";
import { isWebBluetoothSupported } from "@/lib/device/web-bluetooth";
import type { TKey } from "@/lib/i18n";
import { errorMessage } from "@/lib/i18n/errors";
import { type Device, SHADE_COLORS } from "@/lib/mock-data";
import { useRunsInApp } from "@/lib/platform";
import { useDevicesStore } from "@/lib/store/devices-store";
import {
  type PhysicalDevice,
  type PhysicalProductType,
  useHubsStore,
} from "@/lib/store/hubs-store";

type Step =
  | { name: "product" }
  | { name: "pick-hub"; product: PhysicalProductType; hubs: PhysicalDevice[] }
  | { name: "provisioning"; product: PhysicalProductType }
  | { name: "hub-function"; hubId: string; hubName: string }
  | { name: "ac"; hubId: string; hubName: string }
  | { name: "remote"; hubId: string; hubName: string }
  | { name: "rgb"; hubId: string; hubName: string }
  | { name: "temp"; hubId: string; hubName: string }
  | { name: "alarm"; hubId: string; hubName: string }
  | { name: "relay"; physicalId: string };

const TITLES: Record<Step["name"], TKey> = {
  product: "addDevice.steps.product",
  "pick-hub": "addDevice.steps.pickHub",
  provisioning: "addDevice.steps.provisioning",
  "hub-function": "addDevice.steps.hubFunction",
  ac: "addDevice.steps.ac",
  remote: "addDevice.steps.remote",
  rgb: "addDevice.steps.rgb",
  temp: "addDevice.steps.temp",
  alarm: "addDevice.steps.alarm",
  relay: "addDevice.steps.relay",
};

export function AddDeviceFlow({
  roomId,
  initialHub,
}: {
  roomId: string;
  initialHub?: PhysicalDevice;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const inApp = useRunsInApp();
  const addDevice = useDevicesStore((s) => s.addDevice);
  const addDevices = useDevicesStore((s) => s.addDevices);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);

  const [step, setStep] = useState<Step>(
    initialHub
      ? { name: "hub-function", hubId: initialHub.id, hubName: initialHub.name }
      : { name: "product" },
  );

  function finishToRoom() {
    // replace, not push: this screen was itself reached by pushing on top of the room page, so
    // pushing again here would leave add-device stuck in the history stack — back from the room
    // page would pop right back into it instead of wherever the user was before adding a device.
    router.replace(`/home/room?id=${roomId}`);
  }

  // Creating a device needs the server (it assigns the real id), so saving can fail or take a moment:
  // stay on the step and say so instead of navigating away as if it had worked.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function saveThenLeave(save: () => Promise<unknown>) {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await save();
      finishToRoom();
    } catch (error) {
      setSaveError(errorMessage(error, t("addDevice.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  function handleDone(device: Device) {
    void saveThenLeave(() => addDevice(device));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8 lg:mx-0 lg:max-w-full">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{t(TITLES[step.name])}</h1>
        <button
          type="button"
          onClick={finishToRoom}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label={t("common.close")}
        >
          <X className="size-5" />
        </button>
      </div>

      {saving && (
        <p className="text-center text-xs text-muted-foreground">
          {t("addDevice.saving")}
        </p>
      )}
      {saveError && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {saveError}
        </p>
      )}

      {step.name === "product" && (
        <ProductPicker
          onSelect={(product) => {
            // hub-ir is "multi-function": several function kinds (AC, remote, RGB, temp, alarm)
            // can live on the one already-paired hub, told apart by categoryId/kind alone, no
            // channel index needed — unlike relay8, where even a single module still needs its
            // channel picked explicitly, so this shortcut doesn't apply there (see the room/device
            // naming discussion). Only one existing Hub IR in this room → skip straight to picking
            // its function, no extra "which device" step. None → pair a new one, same as before.
            // Two or more → genuinely ambiguous, ask which one.
            const existingHubs = physicalDevices.filter(
              (hub) =>
                hub.productType === product &&
                (roomId === "all" || hub.roomId === roomId),
            );
            if (product === "hub-ir" && existingHubs.length === 1) {
              const hub = existingHubs[0];
              setStep({
                name: "hub-function",
                hubId: hub.id,
                hubName: hub.name,
              });
              return;
            }
            if (product === "hub-ir" && existingHubs.length > 1) {
              setStep({ name: "pick-hub", product, hubs: existingHubs });
              return;
            }
            setStep({ name: "provisioning", product });
          }}
        />
      )}

      {step.name === "pick-hub" && (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-sm text-muted-foreground">
            {t("addDevice.pickHubPrompt")}
          </p>
          {step.hubs.map((hub) => (
            <button
              key={hub.id}
              type="button"
              onClick={() => {
                setStep({
                  name: "hub-function",
                  hubId: hub.id,
                  hubName: hub.name,
                });
              }}
              className="flex items-center gap-3 rounded-2xl bg-card p-4 text-start shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
            >
              <span className="text-sm font-medium">{hub.name}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setStep({ name: "provisioning", product: step.product });
            }}
            className="mt-2 text-center text-sm font-medium text-primary"
          >
            {t("addDevice.pairNewHub")}
          </button>
        </div>
      )}

      {step.name === "provisioning" && !inApp && !isWebBluetoothSupported() && (
        <div className="flex flex-col items-center gap-3 pt-10 text-center">
          <p className="text-sm font-medium">
            {t("addDevice.webPairingTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("addDevice.webPairingBody")}
          </p>
          <button
            type="button"
            onClick={() => {
              setStep({ name: "product" });
            }}
            className="mt-2 h-11 w-full rounded-xl bg-muted text-sm font-semibold text-foreground/70"
          >
            {t("common.back")}
          </button>
        </div>
      )}

      {step.name === "provisioning" && (inApp || isWebBluetoothSupported()) && (
        <BleProvisioning
          product={step.product}
          roomId={roomId}
          onComplete={(created) => {
            if (created.productType === "hub-ir") {
              setStep({
                name: "hub-function",
                hubId: created.id,
                hubName: created.name,
              });
            } else {
              setStep({ name: "relay", physicalId: created.id });
            }
          }}
        />
      )}

      {step.name === "hub-function" && (
        <div className="flex flex-col gap-3">
          <HubFunctionChoice
            hubName={step.hubName}
            onSelect={(kind) => {
              setStep({
                name: kind,
                hubId: step.hubId,
                hubName: step.hubName,
              } as Step);
            }}
          />
          {/* The single-existing-hub shortcut in ProductPicker's onSelect above skips straight
              here, bypassing the "pick-hub" screen that normally hosts this — without it, pairing
              a genuinely new, additional Hub IR would be unreachable once one already exists. */}
          <button
            type="button"
            onClick={() => {
              setStep({ name: "provisioning", product: "hub-ir" });
            }}
            className="text-center text-sm font-medium text-primary"
          >
            {t("addDevice.pairNewHub")}
          </button>
        </div>
      )}

      {step.name === "ac" && (
        <AcSetup roomId={roomId} hubId={step.hubId} onDone={handleDone} />
      )}

      {step.name === "remote" && (
        <RemoteSetup roomId={roomId} hubId={step.hubId} onDone={handleDone} />
      )}

      {step.name === "rgb" && (
        <NativeFunctionSetup
          placeholder={t("addDevice.rgbPlaceholder")}
          roomId={roomId}
          hubId={step.hubId}
          onDone={handleDone}
          buildDevice={(base) => ({
            ...base,
            categoryId: "lighting",
            kind: "rgb",
            intensity: 70,
            color: SHADE_COLORS[0],
            effect: "solid",
            effectSpeed: 3,
          })}
        />
      )}

      {step.name === "temp" && (
        <NativeFunctionSetup
          placeholder={t("addDevice.tempPlaceholder")}
          roomId={roomId}
          hubId={step.hubId}
          onDone={handleDone}
          buildDevice={(base) => ({
            ...base,
            categoryId: "hvac",
            kind: "ac",
            acMode: "cool",
            targetTemp: 24,
            fanSpeed: "auto",
            swing: "auto",
          })}
        />
      )}

      {step.name === "alarm" && (
        <AlarmSetup roomId={roomId} hubId={step.hubId} onDone={handleDone} />
      )}

      {step.name === "relay" && (
        <RelaySetup
          roomId={roomId}
          hubId={step.physicalId}
          onDone={(devices) => {
            void saveThenLeave(() => addDevices(devices));
          }}
        />
      )}
    </div>
  );
}
