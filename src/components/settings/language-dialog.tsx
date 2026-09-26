"use client";

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LANGUAGES } from "@/lib/i18n/languages";
import { setLanguage } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function LanguageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("settings.language")}</DialogTitle>
          <DialogDescription>{t("settings.languageHint")}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-80 flex-col overflow-y-auto">
          {LANGUAGES.map((language) => {
            const selected = i18n.language === language.code;
            return (
              <li key={language.code}>
                <button
                  type="button"
                  lang={language.code}
                  onClick={() => {
                    void setLanguage(language.code, true);
                    onOpenChange(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-start text-sm font-medium hover:bg-muted",
                    selected && "text-primary"
                  )}
                >
                  <span className="flex-1">{language.nativeName}</span>
                  {selected && <Check className="size-4" />}
                </button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
