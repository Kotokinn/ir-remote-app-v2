"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "@/components/app-shell/page-header";
import { InviteDialog } from "@/components/household/invite-dialog";
import { QrScanDialog } from "@/components/household/qr-scan-dialog";
import { ShareTree } from "@/components/household/share-tree";
import { errorMessage } from "@/lib/i18n/errors";
import {
  sharesApi,
  type InviteResponse,
  type InviteTarget,
  type ShareResponse,
  type SharesResponse,
} from "@/lib/api/smart";
import { useDevicesStore } from "@/lib/store/devices-store";
import { useHubsStore } from "@/lib/store/hubs-store";
import { useRoomsStore } from "@/lib/store/rooms-store";

/** Everything a share changes about what this account can see — re-read it all. */
function refreshEverything() {
  void useRoomsStore.getState().fetchRooms();
  void useHubsStore.getState().fetchHubs();
  void useDevicesStore.getState().fetchDevices();
}

function ShareRow({ share, actionLabel, who, onAction }: {
  share: ShareResponse;
  actionLabel: string;
  who: string;
  onAction: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{share.targetName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {share.scope === "ROOM" ? t("household.scopeRoom") : t("household.scopeDevice")} · {who}
        </span>
      </div>
      <button type="button" onClick={onAction} className="text-xs font-semibold text-destructive">
        {actionLabel}
      </button>
    </div>
  );
}

function HouseholdContent() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const rooms = useRoomsStore((s) => s.rooms);
  const devices = useDevicesStore((s) => s.devices);

  const [shares, setShares] = useState<SharesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteResponse | null>(null);
  const [inviting, setInviting] = useState(false);
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const loadShares = useCallback(async () => {
    try {
      setShares(await sharesApi.list());
    } catch (loadError) {
      setError(errorMessage(loadError, t("household.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  async function createInvite(targets: InviteTarget[]): Promise<boolean> {
    if (inviting) return false;
    setInviting(true);
    setError(null);
    try {
      setInvite(await sharesApi.createInvite(targets));
      return true;
    } catch (inviteError) {
      setError(errorMessage(inviteError, t("household.inviteFailed")));
      return false;
    } finally {
      setInviting(false);
    }
  }

  async function join(codeToUse: string = code) {
    if (!codeToUse.trim() || joining) return;
    setJoining(true);
    setError(null);
    setJoined(null);
    try {
      const granted = await sharesApi.redeem(codeToUse);
      setJoined(
        t("household.joined", {
          targets: granted.map((share) => `“${share.targetName}”`).join(", "),
          owner: granted[0].ownerEmail,
        })
      );
      setCode("");
      await loadShares();
      refreshEverything();
    } catch (joinError) {
      setError(errorMessage(joinError, t("household.joinFailed")));
    } finally {
      setJoining(false);
    }
  }

  async function end(share: ShareResponse) {
    setError(null);
    try {
      await sharesApi.remove(share.id);
      await loadShares();
      refreshEverything();
    } catch (removeError) {
      setError(errorMessage(removeError, t("household.endFailed")));
    }
  }

  const ownRooms = rooms.filter((room) => room.access !== "room");
  const ownDevices = devices.filter((device) => device.access !== "room" && device.access !== "device");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col">
      <PageHeader title={t("settings.items.household")} />
      <div className="flex flex-col gap-5 px-4 pb-6">
        {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>}

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{t("household.joinTitle")}</h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
              }}
              placeholder={t("household.codePlaceholder")}
              autoCapitalize="characters"
              className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3.5 font-mono text-sm uppercase tracking-widest outline-none focus:border-primary"
            />
            <button
              type="button"
              onClick={() => {
                setScanning(true);
              }}
              aria-label={t("household.scanAria")}
              className="flex h-11 items-center justify-center rounded-xl bg-muted px-3 text-foreground/70"
            >
              <ScanLine className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                void join();
              }}
              disabled={joining || !code.trim()}
              className="flex h-11 items-center justify-center rounded-xl bg-brand-gradient px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {joining ? <Loader2 className="size-4 animate-spin" /> : t("household.join")}
            </button>
          </div>
          {joined && <p className="px-1 text-xs text-primary">{joined}</p>}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{t("home.sharedWithYou")}</h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {shares === null ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">{t("common.loading")}</p>
            ) : shares.received.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">{t("household.nothingShared")}</p>
            ) : (
              shares.received.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  who={t("household.fromOwner", { email: share.ownerEmail })}
                  actionLabel={t("household.leave")}
                  onAction={() => {
                    void end(share);
                  }}
                />
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{t("household.youreSharing")}</h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl bg-card shadow-sm ring-1 ring-border">
            {shares === null ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">{t("common.loading")}</p>
            ) : shares.given.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">{t("household.nothingGiven")}</p>
            ) : (
              shares.given.map((share) => (
                <ShareRow
                  key={share.id}
                  share={share}
                  who={t("household.withMember", { email: share.memberEmail })}
                  actionLabel={t("household.revoke")}
                  onAction={() => {
                    void end(share);
                  }}
                />
              ))
            )}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-semibold text-muted-foreground">{t("household.shareTitle")}</h2>
          <p className="px-1 text-xs text-muted-foreground">
            {t("household.shareHint")}
          </p>
          <ShareTree rooms={ownRooms} devices={ownDevices} busy={inviting} onShare={createInvite} />
        </section>
      </div>

      {/* Scanning is itself the deliberate act, so a scanned code joins straight away. */}
      <QrScanDialog
        open={scanning}
        onOpenChange={setScanning}
        onCode={(scanned) => {
          setCode(scanned);
          void join(scanned);
        }}
      />

      <InviteDialog
        invite={invite}
        onOpenChange={(open) => {
          if (!open) {
            setInvite(null);
            void loadShares();
          }
        }}
      />
    </div>
  );
}

export default function HouseholdPage() {
  return (
    <Suspense fallback={null}>
      <HouseholdContent />
    </Suspense>
  );
}
