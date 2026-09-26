"use client";

import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app-shell/page-header";
import { SETTINGS_ITEMS } from "@/lib/mock-data";

export function SettingsItemView({ id }: { id: string }) {
  const { t } = useTranslation();
  const setting = SETTINGS_ITEMS.find((s) => s.id === id);
  const Icon = setting?.icon;
  const name = setting ? t(setting.labelKey) : t("settings.title");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <PageHeader title={name} />
      <div className="flex flex-col items-center gap-3 px-4 pt-16 text-center">
        {Icon && (
          <span className="flex size-14 items-center justify-center rounded-full bg-accent text-primary">
            <Icon className="size-6" />
          </span>
        )}
        <p className="text-sm text-muted-foreground">{t("settings.comingSoon", { name })}</p>
      </div>
    </div>
  );
}
