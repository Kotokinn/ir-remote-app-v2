"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { parseInviteCode } from "@/lib/sharing";

/**
 * Opens the Household screen with the code filled in when the app is launched or woken by an invite
 * link (scanned with the phone's camera). It only pre-fills — joining still takes an explicit tap, so
 * a link can't add anything to your account on its own.
 */
export function JoinLinkListener() {
  const router = useRouter();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    function open(urls: string[] | null | undefined) {
      for (const raw of urls ?? []) {
        const code = parseInviteCode(raw);
        if (code) {
          router.push(`/settings/household?code=${encodeURIComponent(code)}`);
          return;
        }
      }
    }

    // Launched by the link (cold start): the URL is waiting, no event will fire for it.
    getCurrent()
      .then(open)
      .catch(() => undefined);
    onOpenUrl(open)
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [router]);

  return null;
}
