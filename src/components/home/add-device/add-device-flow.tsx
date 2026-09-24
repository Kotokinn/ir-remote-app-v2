"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SHADE_COLORS, type Device } from "@/lib/mock-data";
import type { PhysicalDevice, PhysicalProductType } from "@/lib/store/hubs-store";
import { useDevicesStore } from "@/lib/store/devices-store";
import { ProductPicker } from "@/components/home/add-device/product-picker";
import { BleProvisioning } from "@/components/home/add-device/ble-provisioning";
import { HubFunctionChoice } from "@/components/home/add-device/hub-function-choice";
import { AcSetup } from "@/components/home/add-device/ac-setup";
import { RemoteSetup } from "@/components/home/add-device/remote-setup";
import { RelaySetup } from "@/components/home/add-device/relay-setup";
import { NativeFunctionSetup } from "@/components/home/add-device/native-function-setup";
import { AlarmSetup } from "@/components/home/add-device/alarm-setup";

type Step =
  | { name: "product" }
  | { name: "provisioning"; product: PhysicalProductType }
  | { name: "hub-function"; hubId: string; hubName: string }
  | { name: "ac"; hubId: string; hubName: string }
  | { name: "remote"; hubId: string; hubName: string }
  | { name: "rgb"; hubId: string; hubName: string }
  | { name: "temp"; hubId: string; hubName: string }
  | { name: "alarm"; hubId: string; hubName: string }
  | { name: "relay"; physicalId: string };

const TITLES: Record<Step["name"], string> = {
  product: "Add device",
  provisioning: "Connect device",
  "hub-function": "Add a function",
  ac: "Add air conditioner",
  remote: "Add learning remote",
  rgb: "Add RGB light",
  temp: "Add temperature control",
  alarm: "Add alarm",
  relay: "Set up channels",
};

export function AddDeviceFlow({
  roomId,
  initialHub,
}: {
  roomId: string;
  initialHub?: PhysicalDevice;
}) {
  const router = useRouter();
  const addDevice = useDevicesStore((s) => s.addDevice);
  const addDevices = useDevicesStore((s) => s.addDevices);

  const [step, setStep] = useState<Step>(
    initialHub
      ? { name: "hub-function", hubId: initialHub.id, hubName: initialHub.name }
      : { name: "product" }
  );

  function finishToRoom() {
    router.push(`/home/room?id=${roomId}`);
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
      setSaveError(error instanceof Error ? error.message : "Couldn't save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleDone(device: Device) {
    void saveThenLeave(() => addDevice(device));
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{TITLES[step.name]}</h1>
        <button
          type="button"
          onClick={finishToRoom}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>

      {saving && <p className="text-center text-xs text-muted-foreground">Saving…</p>}
      {saveError && (
        <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{saveError}</p>
      )}

      {step.name === "product" && (
        <ProductPicker
          onSelect={(product) => {
            setStep({ name: "provisioning", product });
          }}
        />
      )}

      {step.name === "provisioning" && (
        <BleProvisioning
          product={step.product}
          roomId={roomId}
          onComplete={(created) => {
            if (created.productType === "hub-ir") {
              setStep({ name: "hub-function", hubId: created.id, hubName: created.name });
            } else {
              setStep({ name: "relay", physicalId: created.id });
            }
          }}
        />
      )}

      {step.name === "hub-function" && (
        <HubFunctionChoice
          hubName={step.hubName}
          onSelect={(kind) => {
            setStep({ name: kind, hubId: step.hubId, hubName: step.hubName } as Step);
          }}
        />
      )}

      {step.name === "ac" && (
        <AcSetup roomId={roomId} hubId={step.hubId} onDone={handleDone} />
      )}

      {step.name === "remote" && (
        <RemoteSetup roomId={roomId} hubId={step.hubId} onDone={handleDone} />
      )}

      {step.name === "rgb" && (
        <NativeFunctionSetup
          placeholder="e.g. Bedroom RGB strip"
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
          placeholder="e.g. Living room heater"
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
