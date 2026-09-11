"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  right,
  onBack,
}: {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
}) {
  const router = useRouter();

  return (
    <div className="flex shrink-0 items-center gap-2 px-4 pt-5 pb-2">
      <button
        type="button"
        onClick={onBack ?? (() => { router.back(); })}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
        aria-label="Go back"
      >
        <ChevronLeft className="size-5" />
      </button>
      <h1 className="flex-1 truncate text-lg font-semibold">{title}</h1>
      {right}
    </div>
  );
}
