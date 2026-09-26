"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { parseInviteCode } from "@/lib/sharing";

// jsQR cost grows with pixels; a phone camera frame is far more than a QR needs.
const MAX_SCAN_WIDTH = 640;

function describeCameraError(error: unknown, t: TFunction): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return t("qrScan.denied");
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return t("qrScan.notFound");
  }
  if (name === "NotReadableError") {
    return t("qrScan.busy");
  }
  return t("qrScan.failed");
}

/**
 * Reads an invite QR with the device's own camera (getUserMedia + jsQR, so the same code runs on
 * desktop and mobile webviews). Calls onCode with the invite code once one is found, then closes.
 */
export function QrScanDialog({
  open,
  onOpenChange,
  onCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCode: (code: string) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // The latest callbacks without restarting the camera every time the parent re-renders.
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    let stream: MediaStream | null = null;
    let frame = 0;

    async function start() {
      // Typed as always present, but a webview without secure-context camera support leaves it undefined.
      const mediaDevices = navigator.mediaDevices as MediaDevices | undefined;
      if (typeof mediaDevices?.getUserMedia !== "function") {
        setError(t("qrScan.unavailable"));
        return;
      }
      try {
        stream = await mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      } catch (cameraError) {
        if (!cancelled) setError(describeCameraError(cameraError, t));
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      const scan = () => {
        if (cancelled) return;
        if (context && video.videoWidth > 0) {
          const scale = Math.min(1, MAX_SCAN_WIDTH / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          const code = result ? parseInviteCode(result.data) : null;
          if (code) {
            onCodeRef.current(code);
            onOpenChangeRef.current(false);
            return;
          }
        }
        frame = requestAnimationFrame(scan);
      };
      frame = requestAnimationFrame(scan);
    }

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => {
        track.stop();
      });
    };
  }, [open, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("qrScan.title")}</DialogTitle>
          <DialogDescription>{t("qrScan.description")}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="rounded-xl bg-destructive/10 px-3 py-3 text-sm text-destructive">{error}</p>
        ) : (
          <video ref={videoRef} playsInline muted className="aspect-square w-full rounded-xl bg-black object-cover" />
        )}
      </DialogContent>
    </Dialog>
  );
}
