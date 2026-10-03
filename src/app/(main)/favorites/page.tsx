"use client";

import { Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { getCategory } from "@/lib/mock-data";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore, getPhysicalDevice } from "@/lib/store/hubs-store";
import { cn } from "@/lib/utils";

export default function FavoritesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const allDevices = useDevicesStore((s) => s.devices);
  const updateDevice = useDevicesStore((s) => s.updateDevice);
  const physicalDevices = useHubsStore((s) => s.physicalDevices);
  const favorites = allDevices.filter((d) => d.isFavorite);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8 lg:max-w-full">
      <h1 className="text-2xl font-bold">{t("nav.favorites")}</h1>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 pt-10 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-primary">
            <Star className="size-6" />
          </span>
          <p className="text-sm font-medium">{t("favorites.empty")}</p>
          <p className="text-xs text-muted-foreground">
            {t("favorites.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {favorites.map((device) => {
            const category = getCategory(device.categoryId);
            const Icon = category?.icon ?? Star;
            const hubName = getPhysicalDevice(physicalDevices, device.hubId)?.name;
            return (
              <div
                key={device.id}
                className={cn(
                  "relative flex flex-col items-start gap-4 rounded-2xl p-4 text-start shadow-sm transition-colors",
                  device.isOn
                    ? "bg-brand-gradient text-primary-foreground"
                    : "bg-card text-foreground ring-1 ring-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    void updateDevice(device.id, { isFavorite: false });
                  }}
                  aria-label={t("device.unfavorite", { name: device.name })}
                  className="absolute top-3 end-3"
                >
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push(
                      `/home/category?room=${device.roomId}&category=${device.categoryId}&device=${device.id}`,
                    );
                  }}
                  className="flex flex-col items-start gap-4 text-start"
                >
                  <span
                    className={cn(
                      "text-[10px] font-semibold tracking-wide uppercase",
                      device.isOn
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {device.isOn ? t("common.on") : t("common.off")}
                  </span>
                  <Icon className="size-8" strokeWidth={1.6} />
                  <span className="text-sm font-medium">{device.name}</span>
                  {hubName && (
                    <span
                      className={cn(
                        "truncate text-[11px]",
                        device.isOn
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {t("device.via", { hub: hubName })}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
