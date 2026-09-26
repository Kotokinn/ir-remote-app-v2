"use client";

import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
            }}
            className="h-10 flex-1 rounded-xl bg-muted text-sm font-semibold text-foreground/70"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            className="h-10 flex-1 rounded-xl bg-destructive text-sm font-semibold text-white"
          >
            {confirmLabel ?? t("common.remove")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
