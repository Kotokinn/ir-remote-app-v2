"use client";

import { Radio, Zap } from "lucide-react";
import type { PhysicalProductType } from "@/lib/store/hubs-store";

const PRODUCTS: Array<{
  id: PhysicalProductType;
  name: string;
  description: string;
  icon: typeof Radio;
}> = [
  {
    id: "hub-ir",
    name: "IR Hub",
    description: "Controls ACs and other appliances via infrared — AC codes or a learning remote.",
    icon: Radio,
  },
  {
    id: "relay8",
    name: "8-channel relay module",
    description: "8 independent on/off switches — lights, pumps, gates, or any wired load.",
    icon: Zap,
  },
];

export function ProductPicker({
  onSelect,
}: {
  onSelect: (product: PhysicalProductType) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">
        What are you adding?
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
            className="flex items-start gap-4 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{product.name}</span>
              <span className="text-xs text-muted-foreground">{product.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
