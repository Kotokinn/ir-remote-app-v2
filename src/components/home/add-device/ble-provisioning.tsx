"use client";

import {
  AlertCircle,
  Bluetooth,
  Check,
  Loader2,
  Radio,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api/auth";
import { startClaim } from "@/lib/api/mqtt";
import {
  connectToHub,
  describeBleError,
  disconnectFromHub,
  provisionWifi,
  readDeviceId,
  type ScannedHub,
  scanForHubs,
} from "@/lib/device/ble-provisioning";
import type { TKey } from "@/lib/i18n";
import { errorMessage as describeApiError } from "@/lib/i18n/errors";
import { useRunsInApp } from "@/lib/platform";
import type {
  PhysicalDevice,
  PhysicalProductType,
} from "@/lib/store/hubs-store";
import { useHubsStore } from "@/lib/store/hubs-store";

type Step =
  | "scanning"
  | "pick"
  | "connecting"
  | "wifi"
  | "provisioning"
  | "claiming"
  | "name"
  | "error";

const PRODUCT_LABEL = {
  "hub-ir": "pairing.product.hub-ir",
  relay8: "pairing.product.relay8",
} as const satisfies Record<PhysicalProductType, TKey>;

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
  const { t, i18n } = useTranslation();
  const inApp = useRunsInApp();
  const addPhysicalDevice = useHubsStore((s) => s.addPhysicalDevice);
  const [step, setStep] = useState<Step>("scanning");
  const [found, setFound] = useState<ScannedHub[]>([]);
  const [picked, setPicked] = useState<ScannedHub | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // Suggested name is exactly what the device itself advertises over BLE (DEVICE_PROFILE in
  // firmware, e.g. "SmartIrHub") — not an app-invented label. It's only ever shown/used once a
  // device is picked (pick() below sets it); the product label is just the pre-pick fallback.
  const defaultName = picked?.name ?? t(PRODUCT_LABEL[product]);
  const [name, setName] = useState(defaultName);
  const [errorMessage, setErrorMessage] = useState("");
  const [wifiError, setWifiError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const Icon = product === "hub-ir" ? Radio : Zap;

  useEffect(() => {
    // The app can scan silently and list every hub it hears; the browser can't (see selectWebDevice
    // below) — nothing to auto-run here on the web, so wait for that click instead.
    if (step !== "scanning" || !inApp) return;
    let cancelled = false;
    scanForHubs(SCAN_TIMEOUT_MS)
      .then((devices) => {
        if (cancelled) return;
        setFound(devices);
        setStep("pick");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(describeBleError(error, t("pairing.scanFailed")));
        setStep("error");
      });
    return () => {
      cancelled = true;
    };
  }, [step, inApp]);

  function pick(device: ScannedHub) {
    setPicked(device);
    setName(device.name);
    setStep("connecting");
    connectToHub(device.address, () => {
      // Expected once the device reboots after accepting WiFi credentials — no-op past that point.
    })
      // The advertised name is just the shared product label now — learn the real, unique deviceId
      // via a GATT read right after connecting, before anything else touches the link.
      .then(() => readDeviceId())
      .then((id) => {
        setDeviceId(id);
        setStep("wifi");
      })
      .catch((error: unknown) => {
        setErrorMessage(describeBleError(error, t("pairing.connectFailed")));
        setStep("error");
      });
  }

  /**
   * The web's whole "scan" step: Web Bluetooth's device chooser is scan-and-pick in one native dialog
   * (there is no live list-with-RSSI API to show our own), so this both stands in for the "pick" screen
   * and must run directly from this button's click — not from an effect, not after an earlier `await` —
   * or the browser refuses to open it at all.
   */
  function selectWebDevice() {
    scanForHubs(SCAN_TIMEOUT_MS)
      .then((devices) => {
        // Exactly one — the browser's own chooser already did the picking (see scanForHubs on the web).
        pick(devices[0]);
      })
      .catch((error: unknown) => {
        setErrorMessage(describeBleError(error, t("pairing.scanFailed")));
        setStep("error");
      });
  }

  async function submitWifi() {
    if (!picked || !deviceId) return;
    setWifiError("");
    setStep("provisioning");
    const timeZone =
      Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Ho_Chi_Minh";
    let keepConnected = false;

    try {
      // The device tests the WiFi credentials itself and replies with success/failure.
      const result = await provisionWifi(ssid, password, timeZone);

      if (result.ack && !result.ack.success) {
        // Rejected (wrong SSID/password): the device saved nothing, did not reboot, and the BLE
        // link is still open — let the user retype instead of rescanning from scratch.
        keepConnected = true;
        setWifiError(result.ack.message || t("pairing.wifiRejected"));
        setStep("wifi");
        return;
      }

      // Accepted (or no reply — the claim below is then the real check). The device reboots onto
      // the new network; deviceId was already learned via GATT read right after connecting.
      setStep("claiming");
      await startClaim(deviceId, name.trim() || defaultName);
      setStep("name");
    } catch (error) {
      if (error instanceof ApiError && error.status === 408) {
        setErrorMessage(t("pairing.offlineAfterRestart"));
      } else {
        setErrorMessage(describeBleError(error, t("pairing.provisionFailed")));
      }
      setStep("error");
    } finally {
      if (!keepConnected) {
        disconnectFromHub().catch(() => undefined);
      }
    }
  }

  async function finish() {
    if (!deviceId || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const created = await addPhysicalDevice({
        name: name.trim() || defaultName,
        roomId,
        productType: product,
        deviceId,
      });
      onComplete(created);
    } catch (error) {
      setSaveError(describeApiError(error, t("pairing.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  if (step === "scanning") {
    if (!inApp) {
      return (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <Bluetooth className="size-10 text-primary" />
          <p className="text-sm font-medium">{t("pairing.webSelectTitle")}</p>
          <p className="text-xs text-muted-foreground">
            {t("pairing.scanningHint", {
              product: t(PRODUCT_LABEL[product]).toLocaleLowerCase(
                i18n.language,
              ),
            })}
          </p>
          <button
            type="button"
            onClick={selectWebDevice}
            className="mt-2 h-12 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
          >
            {t("pairing.webSelectButton")}
          </button>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Bluetooth className="size-10 animate-pulse text-primary" />
        <p className="text-sm font-medium">{t("pairing.scanning")}</p>
        <p className="text-xs text-muted-foreground">
          {t("pairing.scanningHint", {
            product: t(PRODUCT_LABEL[product]).toLocaleLowerCase(i18n.language),
          })}
        </p>
      </div>
    );
  }

  if (step === "pick") {
    return (
      <div className="flex flex-col gap-3">
        <p className="px-1 text-sm text-muted-foreground">
          {t("pairing.select")}
        </p>
        {found.length === 0 && (
          <p className="px-1 text-sm text-muted-foreground">
            {t("pairing.noneFound")}
          </p>
        )}
        {found.map((device) => (
          <button
            key={device.address}
            type="button"
            onClick={() => {
              pick(device);
            }}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 text-start shadow-sm ring-1 ring-border"
          >
            <Icon className="size-5 text-primary" />
            <div className="flex flex-1 flex-col">
              <span className="text-sm font-medium" title={device.address}>
                {device.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("pairing.signal", { rssi: device.rssi })}
              </span>
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
          {t("pairing.scanAgain")}
        </button>
      </div>
    );
  }

  if (step === "connecting") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">
          {t("pairing.connecting", {
            name: picked?.name ?? "",
          })}
        </p>
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
          {t("pairing.sendWifi")}
        </div>
        {wifiError && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{wifiError}</span>
          </div>
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("pairing.networkName")}
          </span>
          <input
            value={ssid}
            onChange={(e) => {
              setSsid(e.target.value);
            }}
            required
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {t("pairing.password")}
          </span>
          <input
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
            required
            className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          {t("pairing.connect")}
        </button>
      </form>
    );
  }

  if (step === "provisioning" || step === "claiming") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">
          {step === "provisioning"
            ? t("pairing.checkingWifi")
            : t("pairing.claiming")}
        </p>
        <p className="text-xs text-muted-foreground">
          {step === "provisioning"
            ? t("pairing.checkingWifiHint")
            : t("pairing.claimingHint")}
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
        <p className="text-sm font-medium">{t("pairing.failed")}</p>
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
          {t("common.tryAgain")}
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
        <p className="text-sm font-medium">{t("pairing.connectedName")}</p>
      </div>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
      />
      {saveError && (
        <p className="text-center text-xs text-destructive">{saveError}</p>
      )}
      <button
        type="button"
        onClick={() => {
          void finish();
        }}
        disabled={saving}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-60"
      >
        {saving ? t("addDevice.saving") : t("common.continue")}
      </button>
    </div>
  );
}
