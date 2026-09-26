"use client";

import { AirVent, AlarmClock, Palette, Radio, Thermometer } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import type { TKey } from "@/lib/i18n";

export type HubFunctionKind = "ac" | "remote" | "rgb" | "temp" | "alarm";

const FUNCTIONS: Array<{
  id: HubFunctionKind;
  icon: typeof AirVent;
  titleKey: TKey;
  descriptionKey: TKey;
}> = [
  {
    id: "ac",
    icon: AirVent,
    titleKey: "addDevice.functions.ac.title",
    descriptionKey: "addDevice.functions.ac.desc",
  },
  {
    id: "remote",
    icon: Radio,
    titleKey: "addDevice.functions.remote.title",
    descriptionKey: "addDevice.functions.remote.desc",
  },
  {
    id: "rgb",
    icon: Palette,
    titleKey: "addDevice.functions.rgb.title",
    descriptionKey: "addDevice.functions.rgb.desc",
  },
  {
    id: "temp",
    icon: Thermometer,
    titleKey: "addDevice.functions.temp.title",
    descriptionKey: "addDevice.functions.temp.desc",
  },
  {
    id: "alarm",
    icon: AlarmClock,
    titleKey: "addDevice.functions.alarm.title",
    descriptionKey: "addDevice.functions.alarm.desc",
  },
];

export function HubFunctionChoice({
  hubName,
  onSelect,
}: {
  hubName: string;
  onSelect: (kind: HubFunctionKind) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <p className="px-1 text-sm text-muted-foreground">
        <Trans
          i18nKey="addDevice.controlPrompt"
          values={{ name: hubName }}
          components={{ b: <span className="font-medium text-foreground" /> }}
        />
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
            className="flex items-start gap-4 rounded-2xl bg-card p-4 text-start shadow-sm ring-1 ring-border transition-colors hover:bg-accent/40"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
              <Icon className="size-5" />
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold">{t(fn.titleKey)}</span>
              <span className="text-xs text-muted-foreground">{t(fn.descriptionKey)}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
