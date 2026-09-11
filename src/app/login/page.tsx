"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { GoogleIcon } from "@/components/auth/google-icon";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  function handleGoogleSignIn() {
    setLoading(true);
    // TODO: replace with real Google Identity Services sign-in once a
    // Google Cloud OAuth Client ID is configured for this app.
    setTimeout(() => {
      router.push("/home");
    }, 600);
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-10 bg-background px-6 py-10 sm:mx-auto sm:max-w-sm">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-lg shadow-primary/20">
          <GoogleIcon className="size-7" />
        </span>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to control your smart home.
        </p>
      </div>

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-border bg-card text-sm font-semibold shadow-sm transition-colors hover:bg-accent/40 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <GoogleIcon className="size-5" />
        )}
        {loading ? "Signing in…" : "Continue with Google"}
      </button>

      <p className="text-center text-xs text-muted-foreground">
        By continuing, you agree to let this app manage your smart home
        devices.
      </p>
    </main>
  );
}
