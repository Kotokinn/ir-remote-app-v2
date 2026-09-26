"use client";

import { useEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { detectLanguage, i18n, setLanguage } from "@/lib/i18n";

export function I18nProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void setLanguage(detectLanguage());
  }, []);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
