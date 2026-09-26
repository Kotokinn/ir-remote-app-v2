"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Device } from "@/lib/mock-data";
import { syncAlarmToHub } from "@/lib/device/alarm-sync";
import { weekdayNames } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

function newDeviceId() {
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function AlarmSetup({
  roomId,
  hubId,
  onDone,
}: {
  roomId: string;
  hubId: string;
  onDone: (device: Device) => void;
}) {
  const { t, i18n } = useTranslation();
  const weekdays = weekdayNames(i18n.language, "narrow");
  const [name, setName] = useState("");
  const [time, setTime] = useState("07:00");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  function toggleDay(index: number) {
    setDays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index]
    );
  }

  async function finish() {
    const device: Device = {
      id: newDeviceId(),
      name: name.trim() || t("alarmSetup.defaultName"),
      roomId,
      categoryId: "alarm",
      isOn: true,
      kind: "alarm",
      hubId,
      alarmTime: time,
      alarmDays: days.map(String),
    };

    setSending(true);
    setError("");
    // Push the schedule to the hub before adding the device locally, so we never show an alarm as
    // "set" when the hardware never actually got it.
    const result = await syncAlarmToHub(device);
    setSending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone(device);
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("common.name")}</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder={t("alarmSetup.placeholder")}
          autoFocus
          className="h-11 rounded-xl border border-border px-3.5 text-sm outline-none focus:border-primary"
        />
      </label>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{t("alarmSetup.time")}</span>
        <input
          type="time"
          value={time}
          onChange={(e) => {
            setTime(e.target.value);
          }}
          className="rounded-lg bg-muted px-3 py-1.5 text-lg font-semibold outline-none"
        />
      </div>

      <div className="flex flex-col items-center gap-3">
        <span className="text-sm text-muted-foreground">{t("alarmSetup.repeat")}</span>
        <div className="flex gap-2">
          {weekdays.map((day, i) => (
            <button
              key={`${day}-${i}`}
              type="button"
              onClick={() => {
                toggleDay(i);
              }}
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                days.includes(i)
                  ? "bg-brand-gradient text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {day}
            </button>
          ))}
        </div>
        {days.length === 0 && (
          <p className="text-center text-[11px] text-muted-foreground">
            {t("alarmSetup.noRepeat")}
          </p>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={!name.trim() || sending}
        onClick={() => {
          void finish();
        }}
        className="mt-2 flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-gradient text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 disabled:opacity-50"
      >
        {sending && <Loader2 className="size-4 animate-spin" />}
        {sending ? t("alarmSetup.sending") : t("addDevice.finish")}
      </button>
    </div>
  );
}
