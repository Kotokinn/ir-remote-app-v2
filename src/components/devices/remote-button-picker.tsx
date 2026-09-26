"use client";

import { useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  REMOTE_BUTTON_GROUPS,
  remoteButtonLabel,
  type RemoteButtonPreset,
} from "@/lib/remote-buttons";
import { cn } from "@/lib/utils";

export function RemoteButtonPicker({
  open,
  onOpenChange,
  presets,
  learnedIds,
  flat = false,
  onPick,
  onPickCustom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: RemoteButtonPreset[];
  learnedIds: string[];
  flat?: boolean;
  onPick: (preset: RemoteButtonPreset) => void;
  onPickCustom?: (label: string) => void;
}) {
  const { t } = useTranslation();
  const [customLabel, setCustomLabel] = useState("");
  const groups = REMOTE_BUTTON_GROUPS.filter((g) =>
    presets.some((p) => p.group === g.id)
  );

  function renderGrid(items: RemoteButtonPreset[]) {
    return (
      <div className="grid grid-cols-4 gap-2 px-4 pb-2">
        {items.map((preset) => {
          const Icon = preset.icon;
          const learned = learnedIds.includes(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onPick(preset);
              }}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl border py-3 text-[11px] transition-colors",
                learned
                  ? "border-border text-muted-foreground opacity-50"
                  : "border-border hover:border-primary hover:text-primary"
              )}
            >
              {learned && (
                <Check className="absolute top-1 end-1 size-3 text-primary" />
              )}
              <Icon className="size-5" />
              {remoteButtonLabel(preset.id, preset.label)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:inset-x-0 sm:bottom-6 sm:mx-auto sm:max-w-md sm:rounded-2xl">
        <DrawerHeader>
          <DrawerTitle>{t("remotePicker.title")}</DrawerTitle>
        </DrawerHeader>

        {flat ? (
          renderGrid(presets)
        ) : (
          <Tabs defaultValue={groups[0]?.id} className="px-0">
            <TabsList className="mx-4 w-[calc(100%-2rem)]">
              {groups.map((g) => (
                <TabsTrigger key={g.id} value={g.id} className="text-[11px]">
                  {t(g.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
            {groups.map((g) => (
              <TabsContent key={g.id} value={g.id} className="pt-3">
                {renderGrid(presets.filter((p) => p.group === g.id))}
              </TabsContent>
            ))}
          </Tabs>
        )}

        {onPickCustom && (
          <div className="flex items-center gap-2 px-4 pb-4">
            <input
              value={customLabel}
              onChange={(e) => {
                setCustomLabel(e.target.value);
              }}
              placeholder={t("remotePicker.customPlaceholder")}
              className="h-10 flex-1 rounded-xl border border-border px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="button"
              disabled={!customLabel.trim()}
              onClick={() => {
                onPickCustom(customLabel.trim());
                setCustomLabel("");
              }}
              className="flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              <Sparkles className="size-3.5" />
              {t("common.add")}
            </button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
