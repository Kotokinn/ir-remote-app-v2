"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function ToggleDeviceRow({
  icon: Icon,
  name,
  isOn: initialOn,
}: {
  icon: LucideIcon;
  name: string;
  isOn: boolean;
}) {
  const [isOn, setIsOn] = useState(initialOn);

  return (
    <div className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3 shadow-sm ring-1 ring-border">
      <Icon
        className="size-5 shrink-0"
        style={{ color: isOn ? "var(--primary)" : "var(--muted-foreground)" }}
      />
      <span className="flex-1 truncate text-sm font-medium">{name}</span>
      <Switch checked={isOn} onCheckedChange={setIsOn} />
    </div>
  );
}
