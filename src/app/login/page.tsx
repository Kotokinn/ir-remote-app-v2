"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { GoogleIcon } from "@/components/auth/google-icon";
import { errorMessage } from "@/lib/i18n/errors";
import { signInWithGoogle } from "@/lib/auth/google-oauth";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.push("/home");
    } catch (err) {
      setError(errorMessage(err, t("login.failed")));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-10 sm:mx-auto sm:max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-lg shadow-primary/20">
          <GoogleIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-bold">{t("login.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("login.subtitle")}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          void handleGoogleSignIn();
        }}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-semibold shadow-sm transition-colors hover:bg-accent/40 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <GoogleIcon className="size-5" />
        )}
        {loading ? t("login.signingIn") : t("login.google")}
      </button>

      {error && <p className="text-center text-xs text-destructive">{error}</p>}

      <p className="text-center text-xs text-muted-foreground">
        {t("login.terms")}
      </p>
    </main>
  );
}
