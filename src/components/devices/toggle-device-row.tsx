"use client";

import { Star, Trash2, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export function ToggleDeviceRow({
  icon: Icon,
  name,
  isOn,
  hubName,
  disabled,
  isFavorite,
  onToggleFavorite,
  onRemove,
  onChange,
}: {
  icon: LucideIcon;
  name: string;
  isOn: boolean;
  hubName?: string;
  /** Locked briefly after a tap so a spam-tap can't fire another command before the last one settles. */
  disabled?: boolean;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onRemove?: () => void;
  onChange?: (isOn: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
      <Icon
        className="size-5 shrink-0"
        style={{ color: isOn ? "var(--primary)" : "var(--muted-foreground)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {hubName && (
          <span className="truncate text-[11px] text-muted-foreground">{t("device.via", { hub: hubName })}</span>
        )}
      </div>
      {onToggleFavorite && (
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-label={t(isFavorite ? "device.unfavorite" : "device.favorite", { name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
        >
          <Star
            className={cn("size-4", isFavorite && "fill-primary text-primary")}
          />
        </button>
      )}
      <Switch
        checked={isOn}
        disabled={disabled}
        onCheckedChange={(next) => {
          onChange?.(next);
        }}
      />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("room.removeAria", { name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
