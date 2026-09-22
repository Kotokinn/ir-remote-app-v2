"use client";

import { AirVent, AlarmClock, Palette, Radio, Thermometer } from "lucide-react";

export type HubFunctionKind = "ac" | "remote" | "rgb" | "temp" | "alarm";

const FUNCTIONS: Array<{
  id: HubFunctionKind;
  icon: typeof AirVent;
  title: string;
  description: string;
}> = [
  {
    id: "ac",
    icon: AirVent,
    title: "Air conditioner",
    description: "Control an external AC via IR — pick brand and code, full control.",
  },
  {
    id: "remote",
    icon: Radio,
    title: "Learning remote",
    description: "Any other device (TV, fan, soundbar…) — learn buttons from its original remote.",
  },
  {
    id: "rgb",
    icon: Palette,
    title: "RGB light",
    description: "Native color light built into this hub — modes, brightness, color.",
  },
  {
    id: "temp",
    icon: Thermometer,
    title: "Temperature control",
    description: "Native heating/cooling dial on this hub (not an external AC).",
  },
  {
    id: "alarm",
    icon: AlarmClock,
    title: "Alarm",
    description: "Built-in alarm on this hub — set a time and repeat days.",
  },
];

export function HubFunctionChoice({
  hubName,
  onSelect,
}: {
  hubName: string;
  onSelect: (kind: HubFunctionKind) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">
        What should <span className="font-medium text-foreground">{hubName}</span> control?
      </p>

      {FUNCTIONS.map((fn) => {
        const Icon = fn.icon;
        return (
          <button
            key={fn.id}
            type="button"
            onClick={() => {
              onSelect(fn.id);
            }}
            className="flex items-start gap-4 rounded-2xl bg-card p-4 text-left shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{fn.title}</span>
              <span className="text-xs text-muted-foreground">{fn.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
