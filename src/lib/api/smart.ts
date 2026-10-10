import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/http";

export interface ScenePatch {
  isOn?: boolean;
  mode?: string;
  intensity?: number;
  colorIndex?: number;
  acMode?: string;
  targetTemp?: number;
  fanSpeed?: string;
  swing?: string;
  /** rgb kind: hex color ("#rrggbb"). */
  color?: string;
  effect?: string;
  effectSpeed?: number;
}

export interface SceneActionData {
  deviceId: string;
  patch: ScenePatch;
}

/** How the caller reaches a resource: it's theirs, or shared to them as a whole room / a single device. */
export type AccessLevel = "owner" | "room" | "device";

export interface RoomResponse {
  id: number;
  name: string;
  iconKey: string;
  color: string;
  ownerAccountId: number;
  /** "owner" or "room" (a room shared with the caller). */
  access: AccessLevel;
  createdAt: string;
  updatedAt: string;
}

export interface SceneResponse {
  /** The client-generated id the app made for it. */
  id: string;
  name: string;
  actions: SceneActionData[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneActivationResponse {
  sceneId: string;
  actions: SceneActionData[];
}

export interface ScheduleResponse {
  /** The client-generated id the app made for it. */
  id: string;
  name: string;
  /** The scene's client id. */
  sceneId: string;
  startAt: string;
  days: number[];
  hasEnd: boolean;
  endAt: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationResponse {
  id: number;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface HubResponse {
  id: number;
  name: string;
  roomId: string | null;
  productType: string;
  online: boolean;
  deviceId: string | null;
  preferredTransport: string | null;
  serialPort: string | null;
  createdByAccountId: number;
  ownerAccountId: number;
  access: AccessLevel;
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * A device crosses the API as a flat object shaped like the frontend's Device: the server only
 * understands a few columns (name/roomId/categoryId/kind/isOn/hubId) and stores every other
 * kind-specific field as opaque JSON, so the extra keys pass through untouched.
 */
export type DeviceResponse = Record<string, unknown> & {
  id: number;
  name: string;
  roomId: string | null;
  categoryId: string;
  kind: string;
  isOn: boolean;
  hubId: string | null;
  createdByAccountId: number;
  ownerAccountId: number;
  access: AccessLevel;
  /** Rename/delete: the owner always, a room member only for what they added themselves. */
  canEdit: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ShareScope = "ROOM" | "DEVICE";

/** One thing an invite hands over: a whole room (`roomId`) or a single device (`deviceId`). */
export interface InviteTarget {
  scope: ShareScope;
  roomId?: string;
  deviceId?: number;
}

export interface InviteResponse {
  code: string;
  expiresAt: string;
  /** What the code actually covers — the server drops a device already inside a room being shared whole. */
  targets: Array<{ scope: ShareScope; roomId: string | null; deviceId: number | null; name: string }>;
}

export interface ShareResponse {
  id: number;
  scope: ShareScope;
  roomId: string | null;
  deviceId: number | null;
  targetName: string;
  ownerAccountId: number;
  ownerEmail: string;
  memberAccountId: number;
  memberEmail: string;
  createdAt: string;
}

export interface SharesResponse {
  /** Shares the caller handed out (as owner). */
  given: ShareResponse[];
  /** Shares the caller received (as member). */
  received: ShareResponse[];
}

/**
 * JSON.stringify drops undefined keys, so a store patch like `{ serialPort: undefined }` (meaning
 * "clear it") would silently never reach the server; the PATCH endpoints clear on an explicit null.
 */
export function toWirePatch(patch: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [key, value === undefined ? null : value]));
}

export const hubsApi = {
  list: () => apiGet<HubResponse[]>("/api/smart/hubs"),
  create: (data: { name: string; roomId?: string; productType: string; deviceId?: string }) =>
    apiPost<HubResponse>("/api/smart/hubs", data),
  /** Only the keys present are changed; a null value clears that field. */
  patch: (id: number, patch: Record<string, unknown>) => apiPatch<HubResponse>(`/api/smart/hubs/${id}`, patch),
  /** Also deletes every device derived from the hub. */
  remove: (id: number) => apiDelete<void>(`/api/smart/hubs/${id}`),
};

/** "Add device" by claiming the physical device: over BLE (it signs a nonce) or with its QR label. */
export interface BleClaimSession {
  sessionId: string;
  /** Handed to the device as is (frame claim/sign). */
  nonce: string;
  expiresAt: string;
  serialCode: string | null;
  profile: string;
}

export const claimsApi = {
  startBle: (deviceId: string) => apiPost<BleClaimSession>("/api/smart/claims/ble", { deviceId }),
  completeBle: (
    sessionId: string,
    data: { publicKey: string; signature: string; name: string; roomId?: string; productType: string },
  ) => apiPost<HubResponse>(`/api/smart/claims/ble/${encodeURIComponent(sessionId)}/complete`, data),
  claimQr: (data: { serial: string; code: string; name: string; roomId?: string; productType: string }) =>
    apiPost<HubResponse>("/api/smart/claims/qr", data),
};

export const devicesApi = {
  list: () => apiGet<DeviceResponse[]>("/api/smart/devices"),
  create: (data: Record<string, unknown>) => apiPost<DeviceResponse>("/api/smart/devices", data),
  /** Only the keys present are changed; a null value clears that field. */
  patch: (id: number, patch: Record<string, unknown>) =>
    apiPatch<DeviceResponse>(`/api/smart/devices/${id}`, patch),
  remove: (id: number) => apiDelete<void>(`/api/smart/devices/${id}`),
};

export const sharesApi = {
  list: () => apiGet<SharesResponse>("/api/smart/shares"),
  /** Only the owner of every listed room/device can invite to them. One single-use, expiring code covers all of them. */
  createInvite: (targets: InviteTarget[]) => apiPost<InviteResponse>("/api/smart/shares/invites", { targets }),
  /** One share per target the code carried. */
  redeem: (code: string) => apiPost<ShareResponse[]>("/api/smart/shares/redeem", { code }),
  /** The owner revokes, or the member leaves. */
  remove: (id: number) => apiDelete<void>(`/api/smart/shares/${id}`),
};

export const roomsApi = {
  list: () => apiGet<RoomResponse[]>("/api/smart/rooms"),
  create: (data: { name: string; iconKey: string; color: string }) =>
    apiPost<RoomResponse>("/api/smart/rooms", data),
  remove: (id: number) => apiDelete<void>(`/api/smart/rooms/${id}`),
};

export interface SceneBody {
  name: string;
  actions: SceneActionData[];
}

export interface ScheduleBody {
  name: string;
  /** The scene's client id. */
  sceneId: string;
  startAt: string;
  days: number[];
  hasEnd: boolean;
  endAt?: string;
  enabled: boolean;
}

// Scenes and schedules are addressed by ids the app generates itself, so they can be created offline
// and sent later: every write is an idempotent PUT/DELETE that is safe to repeat (see sync/sync-engine).
export const scenesApi = {
  list: () => apiGet<SceneResponse[]>("/api/smart/scenes"),
  get: (id: string) => apiGet<SceneResponse>(`/api/smart/scenes/${encodeURIComponent(id)}`),
  /** Create-or-replace. */
  upsert: (id: string, data: SceneBody) =>
    apiPut<SceneResponse>(`/api/smart/scenes/${encodeURIComponent(id)}`, data),
  /** Deleting one that is already gone succeeds. */
  remove: (id: string) => apiDelete<void>(`/api/smart/scenes/${encodeURIComponent(id)}`),
  activate: (id: string) =>
    apiPost<SceneActivationResponse>(`/api/smart/scenes/${encodeURIComponent(id)}/activate`),
};

export const schedulesApi = {
  list: () => apiGet<ScheduleResponse[]>("/api/smart/schedules"),
  get: (id: string) => apiGet<ScheduleResponse>(`/api/smart/schedules/${encodeURIComponent(id)}`),
  /** Create-or-replace. Its scene must already exist on the server (400 otherwise). */
  upsert: (id: string, data: ScheduleBody) =>
    apiPut<ScheduleResponse>(`/api/smart/schedules/${encodeURIComponent(id)}`, data),
  /** Deleting one that is already gone succeeds. */
  remove: (id: string) => apiDelete<void>(`/api/smart/schedules/${encodeURIComponent(id)}`),
  setEnabled: (id: string, enabled: boolean) =>
    apiPatch<ScheduleResponse>(`/api/smart/schedules/${encodeURIComponent(id)}/enabled`, { enabled }),
};

export const notificationsApi = {
  list: () => apiGet<NotificationResponse[]>("/api/smart/notifications"),
  markRead: (id: number) => apiPatch<NotificationResponse>(`/api/smart/notifications/${id}/read`, {}),
  remove: (id: number) => apiDelete<void>(`/api/smart/notifications/${id}`),
};
