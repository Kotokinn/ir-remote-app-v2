"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { errorMessage } from "@/lib/i18n/errors";
import { useScenesStore } from "@/lib/store/scenes-store";
import type { SceneAction } from "@/lib/mock-data";
import { SceneDeviceEditor } from "@/components/automation/scene-device-editor";

function SceneFormContent() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sceneId = searchParams.get("id");
  const addScene = useScenesStore((s) => s.addScene);
  const updateScene = useScenesStore((s) => s.updateScene);
  const existing = useScenesStore((s) => s.scenes.find((sc) => sc.id === sceneId));

  const [name, setName] = useState(existing?.name ?? t("sceneForm.newName"));
  const [actions, setActions] = useState<SceneAction[]>(existing?.actions ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        await updateScene(existing.id, name.trim() || t("sceneForm.defaultName"), actions);
      } else {
        await addScene(name.trim() || t("sceneForm.defaultName"), actions);
      }
      router.push("/automation");
    } catch (err) {
      setError(errorMessage(err, t("sceneForm.saveFailed")));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pt-5 pb-6 lg:px-8 lg:mx-0 lg:max-w-full">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            router.back();
          }}
          className="flex size-8 items-center justify-center rounded-full text-foreground/70 hover:bg-muted"
          aria-label={t("common.close")}
        >
          <X className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => {
            void save();
          }}
          disabled={actions.length === 0 || saving}
          className="text-sm font-semibold text-primary disabled:opacity-40"
        >
          {saving ? t("addDevice.saving") : t("common.save")}
        </button>
      </div>

      {error && <p className="px-1 text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2.5">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("sceneForm.namePlaceholder")}
          className="flex-1 bg-transparent text-sm font-medium outline-none"
        />
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        {t("sceneForm.hint")}
      </p>

      <SceneDeviceEditor initialActions={actions} onActionsChange={setActions} />
    </div>
  );
}

export default function ScenePage() {
  return (
    <Suspense fallback={null}>
      <SceneFormContent />
    </Suspense>
  );
}
