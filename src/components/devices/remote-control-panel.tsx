"use client";

import { useState } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getRemoteButtonIcon, remoteButtonLabel, REMOTE_BUTTON_PRESETS, type RemoteButton } from "@/lib/remote-buttons";
import { RemoteButtonPicker } from "@/components/devices/remote-button-picker";
import { cn } from "@/lib/utils";

export function RemoteControlPanel({
  name,
  buttons: initialButtons,
  hubName,
  onButtonsChange,
}: {
  name: string;
  buttons: RemoteButton[];
  hubName?: string;
  onButtonsChange?: (buttons: RemoteButton[]) => void;
}) {
  const { t } = useTranslation();
  const [buttons, setButtons] = useState(initialButtons);
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pressedId, setPressedId] = useState<string | null>(null);

  function commit(next: RemoteButton[]) {
    setButtons(next);
    onButtonsChange?.(next);
  }

  function handlePress(button: RemoteButton) {
    if (editing) return;
    setPressedId(button.id);
    setTimeout(() => {
      setPressedId((id) => (id === button.id ? null : id));
    }, 200);
  }

  function handleRemove(id: string) {
    commit(buttons.filter((b) => b.id !== id));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-base font-semibold">{name}</span>
          {hubName && <span className="text-xs text-muted-foreground">{t("device.via", { hub: hubName })}</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing((v) => !v);
          }}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            editing ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/70"
          )}
        >
          <Pencil className="size-3.5" />
          {editing ? t("common.done") : t("remotePanel.editLayout")}
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {buttons.map((button) => {
          const Icon = getRemoteButtonIcon(button.iconKey);
          return (
            <div key={button.id} className="relative">
              <button
                type="button"
                onClick={() => {
                  handlePress(button);
                }}
                className={cn(
                  "flex w-full flex-col items-center gap-1.5 rounded-2xl bg-card px-2 py-3 text-[11px] font-medium shadow-sm ring-1 ring-border transition-all",
                  pressedId === button.id && "scale-95 bg-accent ring-primary"
                )}
              >
                <Icon className="size-5" />
                <span className="w-full truncate text-center">{remoteButtonLabel(button.iconKey, button.label)}</span>
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    handleRemove(button.id);
                  }}
                  aria-label={t("room.removeAria", { name: remoteButtonLabel(button.iconKey, button.label) })}
                  className="absolute -top-1.5 -end-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-white"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}

        {editing && (
          <button
            type="button"
            onClick={() => {
              setPickerOpen(true);
            }}
            className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-[11px] font-medium text-muted-foreground"
          >
            <Plus className="size-5" />
            {t("common.add")}
          </button>
        )}
      </div>

      <RemoteButtonPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        presets={REMOTE_BUTTON_PRESETS}
        learnedIds={buttons.map((b) => b.iconKey)}
        onPick={(preset) => {
          commit([
            ...buttons,
            {
              id: `${preset.id}-${Date.now().toString(36)}`,
              label: preset.label,
              iconKey: preset.id,
              group: preset.group,
            },
          ]);
          setPickerOpen(false);
        }}
        onPickCustom={(label) => {
          commit([
            ...buttons,
            { id: `custom-${Date.now().toString(36)}`, label, iconKey: "custom", group: "custom" },
          ]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
