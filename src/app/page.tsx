"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { House } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/store/auth-store";

export default function SplashPage() {
  const router = useRouter();
  const { t } = useTranslation();

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        await useAuthStore.persist.rehydrate();
        const { accessToken } = useAuthStore.getState();
        router.replace(accessToken ? "/home" : "/onboarding");
      })();
    }, 1200);
    return () => { clearTimeout(timer); };
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-brand-gradient text-primary-foreground">
      <span className="flex size-20 items-center justify-center rounded-3xl bg-white/15">
        <House className="size-10" strokeWidth={1.6} />
      </span>
      <h1 className="text-xl font-bold tracking-tight">{t("app.name")}</h1>
      <p className="text-sm text-white/80">{t("app.tagline")}</p>
    </main>
  );
}
