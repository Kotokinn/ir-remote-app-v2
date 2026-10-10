"use client";

import { Bluetooth, QrCode } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClaimMethod } from "@/lib/device/claim-methods";
import type { TKey } from "@/lib/i18n";

const OPTIONS: Record<
  ClaimMethod,
  { icon: typeof Bluetooth; nameKey: TKey; hintKey: TKey }
> = {
  ble: {
    icon: Bluetooth,
    nameKey: "pairing.methodBle",
    hintKey: "pairing.methodBleHint",
  },
  qr: {
    icon: QrCode,
    nameKey: "pairing.methodQr",
    hintKey: "pairing.methodQrHint",
  },
};

/** Bluetooth or QR label, for a product that supports both (each is its own flow). */
export function ClaimMethodChoice({
  methods,
  onSelect,
}: {
  methods: readonly ClaimMethod[];
  onSelect: (method: ClaimMethod) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">
        {t("pairing.methodPrompt")}
      </p>
      {methods.map((method) => {
        const option = OPTIONS[method];
        const Icon = option.icon;
        return (
          <button
            key={method}
            type="button"
            onClick={() => {
              onSelect(method);
            }}
            className="flex items-start gap-4 rounded-2xl bg-card p-4 text-start shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t(option.nameKey)}</span>
              <span className="text-xs text-muted-foreground">
                {t(option.hintKey)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
