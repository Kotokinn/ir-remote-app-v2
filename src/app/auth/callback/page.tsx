"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/lib/store/auth-store";

/**
 * Where the browser build lands after Google login: auth-service redirects here with the tokens (or an
 * error) in the URL fragment. Only used by the web build; the installed app receives them by deep link.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  // The effect runs twice in development (StrictMode); the fragment is wiped on the first run.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    // Tokens must not linger in the address bar or the history.
    window.history.replaceState(null, "", window.location.pathname);

    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    const failure = params.get("error");
    if (!failure && accessToken && refreshToken) {
      useAuthStore.getState().setSession(accessToken, refreshToken);
      router.replace("/home");
    } else {
      setError(failure ?? t("errors.googleCancelled"));
    }
  }, [router, t]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold">{t("authCallback.failed")}</h1>
          <p className="max-w-xs text-sm text-muted-foreground">{error}</p>
          <Link href="/login" className="text-sm font-semibold text-primary">
            {t("authCallback.backToLogin")}
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t("authCallback.signingIn")}</p>
        </>
      )}
    </main>
  );
}
