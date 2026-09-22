"use client";

import { useState } from "react";
import { Trash2, type LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function ToggleDeviceRow({
  icon: Icon,
  name,
  isOn: initialOn,
  hubName,
  onRemove,
}: {
  icon: LucideIcon;
  name: string;
  isOn: boolean;
  hubName?: string;
  onRemove?: () => void;
}) {
  const [isOn, setIsOn] = useState(initialOn);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
      <Icon
        className="size-5 shrink-0"
        style={{ color: isOn ? "var(--primary)" : "var(--muted-foreground)" }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        {hubName && (
          <span className="truncate text-[11px] text-muted-foreground">via {hubName}</span>
        )}
      </div>
      <Switch checked={isOn} onCheckedChange={setIsOn} />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}
