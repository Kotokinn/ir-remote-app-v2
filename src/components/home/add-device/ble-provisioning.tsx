"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Bluetooth, Check, Loader2, Radio, Wifi, Zap } from "lucide-react";
import type { PhysicalDevice, PhysicalProductType } from "@/lib/store/hubs-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { ApiError } from "@/lib/api/auth";
import { startClaim } from "@/lib/api/mqtt";
import {
  connectToHub,
  describeBleError,
  disconnectFromHub,
  provisionWifi,
  scanForHubs,
  type ScannedHub,
} from "@/lib/device/ble-provisioning";

type Step = "scanning" | "pick" | "connecting" | "wifi" | "provisioning" | "claiming" | "name" | "error";

const PRODUCT_LABEL: Record<PhysicalProductType, string> = {
  "hub-ir": "IR Hub",
  relay8: "Relay Module",
};

const SCAN_TIMEOUT_MS = 6000;

export function BleProvisioning({
  product,
  roomId,
  onComplete,
}: {
  product: PhysicalProductType;
  roomId: string;
  onComplete: (physicalDevice: PhysicalDevice) => void;
}) {
  const addPhysicalDevice = useHubsStore((s) => s.addPhysicalDevice);
  const [step, setStep] = useState<Step>("scanning");
  const [found, setFound] = useState<ScannedHub[]>([]);
  const [picked, setPicked] = useState<ScannedHub | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState(PRODUCT_LABEL[product]);
  const [errorMessage, setErrorMessage] = useState("");
  const [wifiError, setWifiError] = useState("");

  const Icon = product === "hub-ir" ? Radio : Zap;

  useEffect(() => {
    if (step !== "scanning") return;
    let cancelled = false;
    scanForHubs(SCAN_TIMEOUT_MS)
      .then((devices) => {
        if (cancelled) return;
        setFound(devices);
        setStep("pick");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(describeBleError(error, "Bluetooth scan failed"));
        setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  function pick(device: ScannedHub) {
    setPicked(device);
    setStep("connecting");
    connectToHub(device.address, () => {
      // Expected once the device reboots after accepting WiFi credentials — no-op past that point.
    })
      .then(() => {
        setStep("wifi");
      })
      .catch((error: unknown) => {
        setErrorMessage(describeBleError(error, "Failed to connect over Bluetooth"));
        setStep("error");
      });
  }

  async function submitWifi() {
    if (!picked) return;
    setWifiError("");
    setStep("provisioning");
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
    let keepConnected = false;

    try {
      // The device tests the WiFi credentials itself and replies with success/failure.
      const result = await provisionWifi(ssid, password, timeZone);

      if (result.ack && !result.ack.success) {
        // Rejected (wrong SSID/password): the device saved nothing, did not reboot, and the BLE
        // link is still open — let the user retype instead of rescanning from scratch.
        keepConnected = true;
        setWifiError(result.ack.message || "The device couldn't connect to that Wi-Fi network.");
        setStep("wifi");
        return;
      }

      // Accepted (or no reply — the claim below is then the real check). The device reboots
      // onto the new network; its real deviceId is its advertised name.
      setDeviceId(picked.name);
      setStep("claiming");
      await startClaim(picked.name, name.trim() || PRODUCT_LABEL[product]);
      setStep("name");
    } catch (error) {
      if (error instanceof ApiError && error.status === 408) {
        setErrorMessage(
          "The device didn't come online after restarting. Check that this Wi-Fi network can reach the server, then try again."
        );
      } else {
        setErrorMessage(describeBleError(error, "Provisioning failed"));
      }
      setStep("error");
    } finally {
      if (!keepConnected) {
        disconnectFromHub().catch(() => undefined);
      }
    }
  }

  function finish() {
    if (!deviceId) return;
    const created = addPhysicalDevice({
      name: name.trim() || PRODUCT_LABEL[product],
      roomId,
      productType: product,
      deviceId,
    });
    onComplete(created);
  }

  if (step === "scanning") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Bluetooth className="size-10 animate-pulse text-primary" />
        <p className="text-sm font-medium">Scanning for nearby devices…</p>
        <p className="text-xs text-muted-foreground">
          Make sure your {PRODUCT_LABEL[product].toLowerCase()} is powered on and in pairing mode.
        </p>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="px-1 text-sm text-muted-foreground">Select your device</p>
        {found.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">No devices found nearby.</p>
        )}
        {found.map((device) => (
          <button
            key={device.address}
            type="button"
            onClick={() => {
              pick(device);
            }}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border"
          >
            <Icon className="size-5 text-primary" />
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium">{device.name}</span>
              <span className="text-xs text-muted-foreground">Signal {device.rssi} dBm</span>
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            setStep("scanning");
          }}
          className="mt-2 text-center text-sm font-medium text-primary"
        >
          Scan again
        </button>
      </div>
    );
  }

  if (step === "connecting") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">Connecting to {picked?.name}…</p>
      </div>
    );
  }

  if (step === "wifi") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitWifi();
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <Wifi className="size-4" />
          Send your Wi-Fi details over Bluetooth
        </div>
        {wifiError && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{wifiError}</span>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Network name</span>
          <input
            value={ssid}
            onChange={(e) => { setSsid(e.target.value); }}
            required
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); }}
            required
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          Connect
        </button>
      </form>
    );
  }

  if (step === "provisioning" || step === "claiming") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">
          {step === "provisioning" ? "Checking your Wi-Fi…" : "Device is connecting — claiming it…"}
        </p>
        <p className="text-xs text-muted-foreground">
          {step === "provisioning"
            ? "The device is trying to join your Wi-Fi network. This can take up to 20 seconds."
            : "This can take up to 20 seconds while the device joins Wi-Fi and MQTT."}
        </p>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </span>
        <p className="text-sm font-medium">Pairing failed</p>
        <p className="text-xs text-muted-foreground">{errorMessage}</p>
        <button
          type="button"
          onClick={() => {
            disconnectFromHub().catch(() => undefined);
            setErrorMessage("");
            setStep("scanning");
          }}
          className="mt-2 h-11 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
          <Check className="size-6" />
        </span>
        <p className="text-sm font-medium">Connected! Give it a name</p>
      </div>
      <input
        value={name}
        onChange={(e) => { setName(e.target.value); }}
        className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
      />
      <button
        type="button"
        onClick={finish}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
      >
        Continue
      </button>
    </div>
  );
}
