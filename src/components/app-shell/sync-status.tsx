"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CloudUpload, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { syncEngine } from "@/lib/sync";
import type { TKey } from "@/lib/i18n";
import { useOutboxStore, useOutboxSummary, type OutboxOp } from "@/lib/sync/outbox-store";

const ENTITY_LABEL = {
  scene: "sync.entity.scene",
  schedule: "sync.entity.schedule",
  device: "sync.entity.device",
  hub: "sync.entity.hub",
} as const satisfies Record<OutboxOp["entity"], TKey>;

const KIND_LABEL = {
  upsert: "sync.kind.upsert",
  patch: "sync.kind.patch",
  delete: "sync.kind.delete",
} as const satisfies Record<OutboxOp["kind"], TKey>;

/**
 * The visible half of the "your changes always reach the server" promise: says when changes are still
 * on their way (offline, server slow) and, if the server refused one, says so with the reason and lets
 * the user retry or drop it — a refused change is never silently lost.
 */
export function SyncStatus() {
  const { t } = useTranslation();
  const { pending, failed } = useOutboxSummary();
  const ops = useOutboxStore((state) => state.ops);
  const retryFailed = useOutboxStore((state) => state.retryFailed);
  const discard = useOutboxStore((state) => state.discard);
  const [open, setOpen] = useState(false);

  if (pending === 0 && failed === 0) return null;

  const failedOps = ops.filter((op) => op.status === "failed");
  const waitingReason = ops.find((op) => op.status === "pending" && op.error)?.error;

  return (
    <>
      {failed > 0 ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          className="flex shrink-0 items-center gap-2 bg-destructive/10 px-4 py-2 text-left text-xs font-medium text-destructive"
        >
          <AlertTriangle className="size-4 shrink-0" />
          <span className="flex-1">
            {t("sync.failedBanner", { count: failed })}
          </span>
        </button>
      ) : (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 bg-accent px-4 py-2 text-xs font-medium text-primary"
        >
          {waitingReason ? <CloudUpload className="size-4 shrink-0" /> : <Loader2 className="size-4 shrink-0 animate-spin" />}
          <span className="flex-1">
            {t("sync.waiting", { count: pending })}
            {waitingReason ? ` — ${waitingReason}` : "…"}
          </span>
          <button
            type="button"
            onClick={() => {
              void syncEngine.resume();
            }}
            className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold"
          >
            {t("sync.syncNow")}
          </button>
        </div>
      )}

      <Dialog open={open && failed > 0} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("sync.failedTitle")}</DialogTitle>
            <DialogDescription>
              {t("sync.failedBody")}
            </DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-72 flex-col gap-3 overflow-y-auto">
            {failedOps.map((op) => (
              <li key={op.id} className="flex flex-col gap-1 rounded-xl bg-muted px-3 py-2">
                <span className="text-sm font-medium">
                  {t("sync.item", { entity: t(ENTITY_LABEL[op.entity]), label: op.label, kind: t(KIND_LABEL[op.kind]) })}
                </span>
                <span className="text-xs text-destructive">{op.error}</span>
                <span className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      retryFailed(op.id);
                    }}
                    className="text-xs font-semibold text-primary"
                  >
                    {t("common.retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      discard(op.id);
                    }}
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    {t("sync.drop")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
