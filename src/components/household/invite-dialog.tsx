"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InviteResponse } from "@/lib/api/smart";

/** The link the QR carries. A phone's stock camera opens it in the app via the smarthome:// scheme (same one Google sign-in returns through). */
export function inviteLink(code: string): string {
  return `smarthome://join?code=${encodeURIComponent(code)}`;
}

export function InviteDialog({
  invite,
  onOpenChange,
}: {
  invite: InviteResponse | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
    if (!invite) {
      setQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(inviteLink(invite.code), { margin: 1, width: 240 })
      .then((url) => {
        if (!cancelled) setQr(url);
      })
      .catch((error: unknown) => {
        console.error("[household] QR generation failed", error);
      });
    return () => {
      cancelled = true;
    };
  }, [invite]);

  function copy() {
    if (!invite) return;
    navigator.clipboard
      .writeText(invite.code)
      .then(() => {
        setCopied(true);
      })
      .catch(() => undefined);
  }

  return (
    <Dialog open={invite !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {invite?.targets.length === 1
              ? t("household.inviteTitleOne", { name: invite.targets[0].name })
              : t("household.inviteTitleMany", { count: invite?.targets.length ?? 0 })}
          </DialogTitle>
          <DialogDescription>
            {t("household.inviteHint", { when: invite ? new Date(invite.expiresAt).toLocaleString(i18n.language) : "" })}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm">
          {invite?.targets.map((target) => (
            <li key={`${target.scope}-${target.roomId ?? target.deviceId}`} className="flex items-baseline gap-2">
              <span className="truncate font-medium">{target.name}</span>
              <span className="text-xs text-muted-foreground">
                {target.scope === "ROOM" ? t("household.roomAccess") : t("household.deviceAccess")}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col items-center gap-3 py-2">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={t("household.qrAlt")} className="size-56 rounded-xl bg-white p-2" />
          ) : (
            <div className="size-56 rounded-xl bg-muted" />
          )}
          <button
            type="button"
            onClick={copy}
            className="flex items-center gap-2 rounded-xl bg-muted px-4 py-2 font-mono text-lg font-semibold tracking-widest"
          >
            {invite?.code}
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4 text-muted-foreground" />}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
