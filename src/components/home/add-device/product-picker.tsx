"use client";

import { Radio, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PhysicalProductType } from "@/lib/store/hubs-store";
import type { TKey } from "@/lib/i18n";

const PRODUCTS: Array<{
  id: PhysicalProductType;
  nameKey: TKey;
  descriptionKey: TKey;
  icon: typeof Radio;
}> = [
  {
    id: "hub-ir",
    nameKey: "addDevice.products.hubIr.name",
    descriptionKey: "addDevice.products.hubIr.desc",
    icon: Radio,
  },
  {
    id: "relay8",
    nameKey: "addDevice.products.relay8.name",
    descriptionKey: "addDevice.products.relay8.desc",
    icon: Zap,
  },
];

export function ProductPicker({
  onSelect,
}: {
  onSelect: (product: PhysicalProductType) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">
        {t("addDevice.whatAdding")}
      </p>
      {PRODUCTS.map((product) => {
        const Icon = product.icon;
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => {
              onSelect(product.id);
            }}
            className="flex items-start gap-4 rounded-2xl bg-card p-4 text-start shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t(product.nameKey)}</span>
              <span className="text-xs text-muted-foreground">{t(product.descriptionKey)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
