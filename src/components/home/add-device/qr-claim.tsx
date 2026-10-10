"use client";

import { AlertCircle, Check, Loader2, QrCode } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { QrScanDialog } from "@/components/household/qr-scan-dialog";
import { claimsApi } from "@/lib/api/smart";
import { type ClaimLabel, parseClaimLabel } from "@/lib/device/claim-label";
import { errorMessage as describeApiError } from "@/lib/i18n/errors";
import {
  type PhysicalDevice,
  type PhysicalProductType,
  useHubsStore,
} from "@/lib/store/hubs-store";

type Step = "scan" | "claiming" | "name" | "error";

/**
 * Adding a device with its QR label alone (no Bluetooth needed, the device can be anywhere): the label's
 * serial + secret code go to the server, which creates the hub. The device itself takes no part; it is
 * claimed already when it next comes online. Without a camera the serial and code can be typed in.
 */
export function QrClaim({
  product,
  roomId,
  onComplete,
  onSetupWifi,
}: {
  product: PhysicalProductType;
  roomId: string;
  onComplete: (physicalDevice: PhysicalDevice) => void;
  /** Only for products that also have Bluetooth: set up Wi-Fi over it after the claim. */
  onSetupWifi?: () => void;
}) {
  const { t } = useTranslation();
  const adoptHub = useHubsStore((s) => s.adoptHub);
  const updatePhysicalDevice = useHubsStore((s) => s.updatePhysicalDevice);
  const [step, setStep] = useState<Step>("scan");
  const [scanning, setScanning] = useState(false);
  const [serial, setSerial] = useState("");
  const [code, setCode] = useState("");
  const [hub, setHub] = useState<PhysicalDevice | null>(null);
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  async function claim(label: ClaimLabel) {
    setStep("claiming");
    try {
      const created = adoptHub(
        await claimsApi.claimQr({
          serial: label.serial,
          code: label.code,
          name: label.serial,
          roomId,
          productType: product,
        }),
      );
      setHub(created);
      setName(created.name);
      setStep("name");
    } catch (error) {
      setErrorMessage(describeApiError(error, t("pairing.provisionFailed")));
      setStep("error");
    }
  }

  async function finish() {
    if (!hub) return;
    const finalName = name.trim() || hub.name;
    if (finalName !== hub.name) {
      await updatePhysicalDevice(hub.id, { name: finalName });
    }
    onComplete({ ...hub, name: finalName });
  }

  if (step === "claiming") {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <Loader2 className="size-10 animate-spin text-primary" />
        <p className="text-sm font-medium">{t("pairing.verifying")}</p>
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
            setErrorMessage("");
            setStep("scan");
          }}
          className="mt-2 h-11 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          {t("common.tryAgain")}
        </button>
      </div>
    );
  }

  if (step === "name") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <Check className="size-6" />
          </span>
          <p className="text-sm font-medium">
            {t("pairing.qrDoneTitle", { serial: hub?.name ?? "" })}
          </p>
          <p className="text-xs text-muted-foreground">
            {onSetupWifi ? t("pairing.qrDoneHint") : t("pairing.qrDoneAuto")}
          </p>
        </div>
        <input
          value={name}
          aria-label={t("pairing.connectedName")}
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
          className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          {t("common.continue")}
        </button>
        {onSetupWifi && (
          <button
            type="button"
            onClick={onSetupWifi}
            className="text-center text-sm font-medium text-primary"
          >
            {t("pairing.setupWifi")}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <QrCode className="size-10 text-primary" />
        <p className="text-xs text-muted-foreground">
          {t("pairing.qrDescription")}
        </p>
        <button
          type="button"
          onClick={() => {
            setScanning(true);
          }}
          className="mt-2 h-12 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
        >
          {t("pairing.qrScanButton")}
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (serial.trim() && code.trim())
            void claim({ serial: serial.trim(), code: code.trim() });
        }}
        className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border"
      >
        <p className="text-xs text-muted-foreground">{t("pairing.qrManual")}</p>
        <input
          value={serial}
          placeholder="SMI-100123"
          aria-label={t("pairing.qrSerial")}
          onChange={(e) => {
            setSerial(e.target.value);
          }}
          className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
        />
        <input
          value={code}
          placeholder="K7F3M-9QX2A"
          aria-label={t("pairing.qrCode")}
          autoCapitalize="characters"
          onChange={(e) => {
            setCode(e.target.value);
          }}
          className="h-11 rounded-xl border border-border px-3.5 font-mono text-sm tracking-widest outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!serial.trim() || !code.trim()}
          className="h-11 rounded-xl bg-muted text-sm font-semibold text-foreground/80 disabled:opacity-60"
        >
          {t("pairing.qrSubmit")}
        </button>
      </form>
      <QrScanDialog
        open={scanning}
        onOpenChange={setScanning}
        parse={(text) => (parseClaimLabel(text) ? text : null)}
        onCode={(text) => {
          const label = parseClaimLabel(text);
          if (label) void claim(label);
        }}
        title={t("pairing.qrTitle")}
        description={t("pairing.qrDescription")}
      />
    </div>
  );
}
