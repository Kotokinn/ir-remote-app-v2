"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { Device } from "@/lib/mock-data";
import {
  REMOTE_BUTTON_PRESETS,
  getRemoteButtonIcon,
  remoteButtonLabel,
  type RemoteButton,
  type RemoteButtonPreset,
} from "@/lib/remote-buttons";
import { RemoteButtonPicker } from "@/components/devices/remote-button-picker";

type Step = "naming" | "buttons";
type Pending = { label: string; iconKey: string; group: RemoteButton["group"] } | null;

function newDeviceId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function RemoteSetup({
  roomId,
  hubId,
  onDone,
}: {
  roomId: string;
  hubId: string;
  onDone: (device: Device) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("naming");
  const [name, setName] = useState("");
  const [buttons, setButtons] = useState<RemoteButton[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  function learn(next: Pending) {
    setPickerOpen(false);
    setPending(next);
    setTimeout(() => {
      if (!next) return;
      setButtons((prev) => [
        ...prev,
        { id: `${next.iconKey}-${Date.now().toString(36)}`, label: next.label, iconKey: next.iconKey, group: next.group },
      ]);
      setPending(null);
    }, 700);
  }

  function finish() {
    onDone({
      id: newDeviceId(),
      name: name.trim() || t("remoteSetup.defaultName"),
      roomId,
      categoryId: "ir",
      isOn: false,
      kind: "remote",
      hubId,
      buttons,
    });
  }

  if (step === "naming") {
    return (
      <div className="flex flex-col gap-4">
        <p className="px-1 text-sm text-muted-foreground">
          {t("remoteSetup.whatSettingUp")}
        </p>
        <input
          value={name}
          onChange={(e) => { setName(e.target.value); }}
          placeholder={t("remoteSetup.namePlaceholder")}
          autoFocus
          className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={!name.trim()}
          onClick={() => { setStep("buttons"); }}
          className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
        >
          {t("common.continue")}
        </button>
      </div>
    );
  }

  if (pending) {
    return (
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-accent text-primary">
          {(() => {
            const Icon = getRemoteButtonIcon(pending.iconKey);
            return <Icon className="size-7" />;
          })()}
        </span>
        <p className="text-sm font-medium">
          {t("remoteSetup.pointRemote", { label: remoteButtonLabel(pending.iconKey, pending.label) })}
        </p>
        <p className="text-xs text-muted-foreground">{t("remoteSetup.learning")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm text-muted-foreground">
        <Trans
          i18nKey="remoteSetup.addAtLeast"
          values={{ name }}
          components={{ b: <span className="font-medium text-foreground" /> }}
        />
      </p>

      <div className="grid grid-cols-4 gap-3">
        {buttons.map((button) => {
          const Icon = getRemoteButtonIcon(button.iconKey);
          return (
            <div
              key={button.id}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-card px-2 py-3 text-[11px] font-medium shadow-sm ring-1 ring-border"
            >
              <Icon className="size-5" />
              <span className="w-full truncate text-center">{remoteButtonLabel(button.iconKey, button.label)}</span>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => { setPickerOpen(true); }}
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-[11px] font-medium text-muted-foreground"
        >
          <Plus className="size-5" />
          {t("common.add")}
        </button>
      </div>

      <button
        type="button"
        disabled={buttons.length === 0}
        onClick={finish}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
      >
        <Check className="size-4" />
        {t("remoteSetup.finish", { count: buttons.length })}
      </button>

      <RemoteButtonPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        presets={REMOTE_BUTTON_PRESETS}
        learnedIds={buttons.map((b) => b.iconKey)}
        onPick={(preset: RemoteButtonPreset) => {
          learn({ label: preset.label, iconKey: preset.id, group: preset.group });
        }}
        onPickCustom={(label) => {
          learn({ label, iconKey: "custom", group: "custom" });
        }}
      />
    </div>
  );
}
