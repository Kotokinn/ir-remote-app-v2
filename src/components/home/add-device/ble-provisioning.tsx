"use client";

import {
  AlertCircle,
  Bluetooth,
  Check,
  Eye,
  EyeOff,
  Hand,
  Loader2,
  Radio,
  Wifi,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api/auth";
import { claimsApi } from "@/lib/api/smart";
import {
  ClaimModeRequiredError,
  connectToHub,
  type DeviceIdentity,
  describeBleError,
  disconnectFromHub,
  provisionWifi,
  queryIdentity,
  readDeviceId,
  rememberBleDeviceId,
  type ScannedHub,
  scanForHubs,
  sendClaimDone,
  signClaimNonce,
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
  | "hold-button"
  | "verifying"
  | "wifi"
  | "provisioning"
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
  const adoptHub = useHubsStore((s) => s.adoptHub);
  const updatePhysicalDevice = useHubsStore((s) => s.updatePhysicalDevice);
  // The device is claimed with its own signature; the server creates the hub as part of the claim.
  const [claimedHub, setClaimedHub] = useState<PhysicalDevice | null>(null);
  const [step, setStep] = useState<Step>("scanning");
  const [found, setFound] = useState<ScannedHub[]>([]);
  const [picked, setPicked] = useState<ScannedHub | null>(null);
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  // Suggested name is exactly what the device itself advertises over BLE (DEVICE_PROFILE in
  // firmware, e.g. "SmartIrHub") — not an app-invented label. It's only ever shown/used once a
  // device is picked (pick() below sets it); the product label is just the pre-pick fallback.
  const defaultName = picked?.name ?? t(PRODUCT_LABEL[product]);
  const [name, setName] = useState(defaultName);
  const [errorMessage, setErrorMessage] = useState("");
  const [wifiError, setWifiError] = useState("");

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
      .then(async (id) => {
        setDeviceId(id);
        rememberBleDeviceId(id, device.address);
        const found = await queryIdentity();
        if (!found) {
          // Firmware without a key of its own (no `identity` frame) can't be claimed any more.
          setErrorMessage(t("pairing.firmwareTooOld"));
          setStep("error");
          return;
        }
        if (!found.claimMode) {
          setStep("hold-button");
          return;
        }
        await claimOverBle(id, found, device.name);
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

  /**
   * Phase 2 claim: the server hands out a nonce, the device signs it with its own key (it must be in
   * claim mode), and the server creates the hub. Then Wi-Fi if the device has none yet.
   */
  async function claimOverBle(
    id: string,
    device: DeviceIdentity,
    advertisedName: string,
  ) {
    setStep("verifying");
    try {
      let hub = claimedHub?.deviceId === id ? claimedHub : null;
      if (!hub) {
        try {
          const session = await claimsApi.startBle(id);
          const signature = await signClaimNonce(session.nonce);
          const created = await claimsApi.completeBle(session.sessionId, {
            publicKey: device.publicKey,
            signature,
            name:
              device.serial !== ""
                ? device.serial
                : (session.serialCode ?? advertisedName),
            roomId,
            productType: product,
          });
          hub = adoptHub(created);
        } catch (error) {
          // Already ours (e.g. claimed with its QR label a moment ago): carry on with Wi-Fi.
          const mine = useHubsStore
            .getState()
            .physicalDevices.find((d) => d.deviceId === id);
          if (
            !(error instanceof ApiError) ||
            error.code !== "DEVICE_ALREADY_CLAIMED" ||
            !mine
          ) {
            throw error;
          }
          hub = mine;
        }
      }
      setClaimedHub(hub);
      setName(hub.name);
      if (device.online) {
        await sendClaimDone().catch(() => undefined);
        disconnectFromHub().catch(() => undefined);
        setStep("name");
      } else {
        setStep("wifi");
      }
    } catch (error) {
      if (error instanceof ClaimModeRequiredError) {
        setStep("hold-button");
        return;
      }
      setErrorMessage(
        error instanceof ApiError
          ? describeApiError(error, t("pairing.provisionFailed"))
          : describeBleError(error, t("pairing.provisionFailed")),
      );
      setStep("error");
    }
  }

  /** Still connected; the user is now holding the button: ask again. */
  async function checkClaimModeAgain() {
    if (!deviceId) return;
    setStep("verifying");
    const found = await queryIdentity().catch(() => null);
    if (!found) {
      setErrorMessage(t("pairing.connectFailed"));
      setStep("error");
      return;
    }
    if (!found.claimMode) {
      setStep("hold-button");
      return;
    }
    await claimOverBle(deviceId, found, picked?.name ?? defaultName);
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

      // Already claimed over BLE; once on Wi-Fi the device fetches its own MQTT credential by
      // itself (docs/FIRMWARE_INTEGRATION.md, section 6).
      setStep("name");
    } catch (error) {
      setErrorMessage(describeBleError(error, t("pairing.provisionFailed")));
      setStep("error");
    } finally {
      if (!keepConnected) {
        disconnectFromHub().catch(() => undefined);
      }
    }
  }

  async function finish() {
    if (!claimedHub) return;
    // The claim already created the hub; only a new name is left to save.
    const finalName = name.trim() || claimedHub.name;
    if (finalName !== claimedHub.name) {
      await updatePhysicalDevice(claimedHub.id, { name: finalName });
    }
    onComplete({ ...claimedHub, name: finalName });
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

  if (step === "hold-button") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          <Hand className="size-6" />
        </span>
        <p className="text-sm font-medium">{t("pairing.holdButtonTitle")}</p>
        <p className="text-xs text-muted-foreground">
          {t("pairing.holdButtonHint")}
        </p>
        <button
          type="button"
          onClick={() => {
            void checkClaimModeAgain();
          }}
          className="mt-2 h-11 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          {t("pairing.checkAgain")}
        </button>
      </div>
    );
  }

  if (step === "verifying") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">{t("pairing.verifying")}</p>
        <p className="text-xs text-muted-foreground">
          {t("pairing.verifyingHint")}
        </p>
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

  if (step === "provisioning") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">{t("pairing.checkingWifi")}</p>
        <p className="text-xs text-muted-foreground">
          {t("pairing.checkingWifiHint")}
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
      <button
        type="button"
        onClick={() => {
          void finish();
        }}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-60"
      >
        {t("common.continue")}
      </button>
    </div>
  );
}
