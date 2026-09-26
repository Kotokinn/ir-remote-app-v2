"use client";

import { useState } from "react";
import { AlertCircle, Loader2, ThermometerSun } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Device } from "@/lib/mock-data";
import { AC_FALLBACK_BUTTONS, remoteButtonLabel, type RemoteButton, type RemoteButtonPreset } from "@/lib/remote-buttons";
import type { AcState } from "@/components/devices/ac-control-panel";
import { AC_BRANDS, type AcBrand } from "@/lib/device/ac-brands";
import { buildSendAcCommand } from "@/lib/device/commands";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { getPhysicalDevice, useHubsStore } from "@/lib/store/hubs-store";

type Step = "brand" | "test" | "fallback-learn" | "naming";
type SendState = "idle" | "sending" | "sent" | "failed";

// What we send while probing a protocol variant: switch the unit on, cool, 24 degrees —
// something the user can see or hear the AC react to.
const TEST_STATE: AcState = { isOn: true, acMode: "cool", targetTemp: 24, fanSpeed: "auto", swing: "auto" };

function newDeviceId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AcSetup({
  roomId,
  hubId,
  onDone,
}: {
  roomId: string;
  hubId: string;
  onDone: (device: Device) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("brand");
  const [brand, setBrand] = useState<AcBrand | null>(null);
  const [variantIndex, setVariantIndex] = useState(0);
  // The protocol variant the user confirmed made their AC react (stored on the device).
  const [protocol, setProtocol] = useState("");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState("");
  const [name, setName] = useState("");
  const [resultKind, setResultKind] = useState<"ac" | "remote">("ac");
  const [learnedButtons, setLearnedButtons] = useState<RemoteButton[]>([]);
  const [learnIndex, setLearnIndex] = useState(0);
  const [learning, setLearning] = useState(false);

  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const hubDeviceId = getPhysicalDevice(physicalDevices, hubId)?.deviceId;

  async function sendTest(protocolName: string) {
    setSendError("");
    if (!hubDeviceId) {
      setSendState("failed");
      setSendError(t("acSetup.notPaired"));
      return;
    }
    setSendState("sending");
    try {
      await sendDeviceCommand(hubDeviceId, "sendAc", buildSendAcCommand(protocolName, TEST_STATE).params);
      setSendState("sent");
    } catch (error) {
      setSendState("failed");
      setSendError(error instanceof Error ? error.message : t("acSetup.testFailedDefault"));
    }
  }

  function chooseBrand(chosen: AcBrand) {
    setBrand(chosen);
    setVariantIndex(0);
    setStep("test");
    void sendTest(chosen.protocols[0]);
  }

  // The AC didn't react to this variant - probe the brand's next one, if there is one.
  function tryNextVariant() {
    if (!brand) return;
    const next = variantIndex + 1;
    setVariantIndex(next);
    if (next < brand.protocols.length) {
      void sendTest(brand.protocols[next]);
    } else {
      setSendState("idle");
    }
  }

  function restartVariants() {
    if (!brand) return;
    setVariantIndex(0);
    void sendTest(brand.protocols[0]);
  }

  function confirmTestWorked() {
    if (!brand) return;
    setProtocol(brand.protocols[variantIndex]);
    setName(t("acSetup.defaultNameBrand", { brand: brand.label }));
    setResultKind("ac");
    setStep("naming");
  }

  function learnButton(preset: RemoteButtonPreset) {
    setLearning(true);
    setTimeout(() => {
      setLearnedButtons((prev) => [
        ...prev,
        { id: `${preset.id}-${Date.now().toString(36)}`, label: preset.label, iconKey: preset.id, group: preset.group },
      ]);
      setLearning(false);
      if (learnIndex + 1 >= AC_FALLBACK_BUTTONS.length) {
        setResultKind("remote");
        setName(t("acSetup.myAc"));
        setStep("naming");
      } else {
        setLearnIndex((i) => i + 1);
      }
    }, 700);
  }

  function finish() {
    const base = {
      id: newDeviceId(),
      name: name.trim() || t("addDevice.functions.ac.title"),
      roomId,
      categoryId: "hvac" as const,
      isOn: false,
      hubId,
    };
    if (resultKind === "ac") {
      onDone({ ...base, kind: "ac", acMode: "cool", targetTemp: 24, fanSpeed: "auto", swing: "auto", brand: protocol });
    } else {
      onDone({ ...base, kind: "remote", buttons: learnedButtons });
    }
  }

  if (step === "brand") {
    return (
      <div className="flex flex-col gap-3">
        <p className="px-1 text-sm text-muted-foreground">{t("acSetup.selectBrand")}</p>
        <div className="grid grid-cols-2 gap-2">
          {AC_BRANDS.map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={() => {
                chooseBrand(b);
              }}
              className="rounded-xl bg-card px-4 py-3 text-sm font-medium shadow-sm ring-1 ring-border"
            >
              {b.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => { setStep("fallback-learn"); }}
          className="mt-2 text-center text-sm font-medium text-primary"
        >
          {t("acSetup.cantFind")}
        </button>
      </div>
    );
  }

  if (step === "test" && brand) {
    const total = brand.protocols.length;

    // Every variant of this brand has been tried without the AC reacting.
    if (variantIndex >= total) {
      return (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ThermometerSun className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("acSetup.noneWorked", { brand: brand.label })}</p>
          <p className="text-xs text-muted-foreground">
            {t("acSetup.triedAll", { count: total, brand: brand.label })}
          </p>
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              onClick={restartVariants}
              className="h-11 rounded-xl bg-muted text-sm font-semibold text-foreground/80"
            >
              {t("acSetup.retryBrand", { brand: brand.label })}
            </button>
            <button
              type="button"
              onClick={() => { setStep("fallback-learn"); }}
              className="h-11 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
            >
              {t("acSetup.learnManually")}
            </button>
            <button
              type="button"
              onClick={() => { setStep("brand"); }}
              className="text-sm font-medium text-primary"
            >
              {t("acSetup.pickAnother")}
            </button>
          </div>
        </div>
      );
    }

    const current = brand.protocols[variantIndex];

    if (sendState === "sending" || sendState === "idle") {
      return (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <Loader2 className="size-10 animate-spin text-primary" />
          <p className="text-sm font-medium">
            {t("acSetup.testing", { brand: brand.label, index: variantIndex + 1, total })}
          </p>
          <p className="text-xs text-muted-foreground">{t("acSetup.testingHint")}</p>
        </div>
      );
    }

    if (sendState === "failed") {
      return (
        <div className="flex flex-col items-center gap-4 pt-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("acSetup.sendFailed")}</p>
          <p className="text-xs text-muted-foreground">{sendError}</p>
          <div className="flex w-full gap-3">
            <button
              type="button"
              onClick={() => { setStep("brand"); }}
              className="h-11 flex-1 rounded-xl bg-muted text-sm font-semibold text-foreground/70"
            >
              {t("common.back")}
            </button>
            <button
              type="button"
              onClick={() => { void sendTest(current); }}
              className="h-11 flex-1 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
            >
              {t("common.tryAgain")}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
          <ThermometerSun className="size-6" />
        </span>
        <p className="text-sm font-medium">
          {t("acSetup.signalSent", { brand: brand.label, index: variantIndex + 1, total })}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("acSetup.checkAc")}
        </p>
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={tryNextVariant}
            className="h-11 flex-1 rounded-xl bg-muted text-sm font-semibold text-foreground/70"
          >
            {variantIndex + 1 < total ? t("acSetup.nextCode") : t("acSetup.noneWorkedShort")}
          </button>
          <button
            type="button"
            onClick={confirmTestWorked}
            className="h-11 flex-1 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20"
          >
            {t("acSetup.yesWorked")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => { void sendTest(current); }}
          className="text-center text-sm font-medium text-primary"
        >
          {t("acSetup.sendAgain")}
        </button>
        <button
          type="button"
          onClick={() => { setStep("fallback-learn"); }}
          className="text-center text-sm font-medium text-primary"
        >
          {t("acSetup.noneOfThese")}
        </button>
      </div>
    );
  }

  if (step === "fallback-learn") {
    const preset = AC_FALLBACK_BUTTONS[learnIndex];
    return (
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <p className="text-sm text-muted-foreground">
          {t("acSetup.buttonN", { index: learnIndex + 1, total: AC_FALLBACK_BUTTONS.length })}
        </p>
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-primary">
          <preset.icon className="size-7" />
        </span>
        <p className="text-sm font-medium">
          {t("remoteSetup.pointRemote", { label: remoteButtonLabel(preset.id, preset.label) })}
        </p>
        <button
          type="button"
          disabled={learning}
          onClick={() => { learnButton(preset); }}
          className="h-11 w-full rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-60"
        >
          {learning ? t("remoteSetup.learning") : t("acSetup.learnThis")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 pt-4 pb-2 text-center">
        <p className="text-sm font-medium">
          {resultKind === "ac" ? t("acSetup.itWorks") : t("acSetup.allSet")}
        </p>
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
        {t("addDevice.finish")}
      </button>
    </div>
  );
}
