"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Device } from "@/lib/mock-data";

function newDeviceId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function NativeFunctionSetup({
  placeholder,
  roomId,
  hubId,
  onDone,
  buildDevice,
}: {
  placeholder: string;
  roomId: string;
  hubId: string;
  onDone: (device: Device) => void;
  buildDevice: (base: {
    id: string;
    name: string;
    roomId: string;
    isOn: boolean;
    hubId: string;
  }) => Device;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-sm text-muted-foreground">{t("addDevice.giveName")}</p>
      <input
        value={name}
        onChange={(e) => {
          setName(e.target.value);
        }}
        placeholder={placeholder}
        autoFocus
        className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          onDone(
            buildDevice({
              id: newDeviceId(),
              name: name.trim(),
              roomId,
              isOn: false,
              hubId,
            })
          );
        }}
        className="mt-2 h-12 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
      >
        {t("addDevice.finish")}
      </button>
    </div>
  );
}
