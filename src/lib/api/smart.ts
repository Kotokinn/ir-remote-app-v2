import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "@/lib/api/http";

export interface ScenePatch {
  isOn?: boolean;
  mode?: string;
  intensity?: number;
  colorIndex?: number;
  acMode?: string;
  targetTemp?: number;
  fanSpeed?: string;
  swing?: boolean;
  effect?: string;
  effectSpeed?: number;
}

export interface SceneActionData {
  deviceId: string;
  patch: ScenePatch;
}

export interface RoomResponse {
  id: number;
  name: string;
  iconKey: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface SceneResponse {
  id: number;
  name: string;
  actions: SceneActionData[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneActivationResponse {
  sceneId: number;
  actions: SceneActionData[];
}

export interface ScheduleResponse {
  id: number;
  name: string;
  sceneId: number;
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

export const roomsApi = {
  list: () => apiGet<RoomResponse[]>("/api/smart/rooms"),
  create: (data: { name: string; iconKey: string; color: string }) =>
    apiPost<RoomResponse>("/api/smart/rooms", data),
  remove: (id: number) => apiDelete<void>(`/api/smart/rooms/${id}`),
};

export const scenesApi = {
  list: () => apiGet<SceneResponse[]>("/api/smart/scenes"),
  get: (id: number) => apiGet<SceneResponse>(`/api/smart/scenes/${id}`),
  create: (data: { name: string; actions: SceneActionData[] }) =>
    apiPost<SceneResponse>("/api/smart/scenes", data),
  update: (id: number, data: { name: string; actions: SceneActionData[] }) =>
    apiPut<SceneResponse>(`/api/smart/scenes/${id}`, data),
  remove: (id: number) => apiDelete<void>(`/api/smart/scenes/${id}`),
  activate: (id: number) => apiPost<SceneActivationResponse>(`/api/smart/scenes/${id}/activate`),
};

export const schedulesApi = {
  list: () => apiGet<ScheduleResponse[]>("/api/smart/schedules"),
  get: (id: number) => apiGet<ScheduleResponse>(`/api/smart/schedules/${id}`),
  create: (data: {
    name: string;
    sceneId: number;
    startAt: string;
    days: number[];
    hasEnd: boolean;
    endAt?: string;
    enabled: boolean;
  }) => apiPost<ScheduleResponse>("/api/smart/schedules", data),
  update: (
    id: number,
    data: {
      name: string;
      sceneId: number;
      startAt: string;
      days: number[];
      hasEnd: boolean;
      endAt?: string;
      enabled: boolean;
    }
  ) => apiPut<ScheduleResponse>(`/api/smart/schedules/${id}`, data),
  remove: (id: number) => apiDelete<void>(`/api/smart/schedules/${id}`),
  setEnabled: (id: number, enabled: boolean) =>
    apiPatch<ScheduleResponse>(`/api/smart/schedules/${id}/enabled`, { enabled }),
};

export const notificationsApi = {
  list: () => apiGet<NotificationResponse[]>("/api/smart/notifications"),
  markRead: (id: number) => apiPatch<NotificationResponse>(`/api/smart/notifications/${id}/read`, {}),
  remove: (id: number) => apiDelete<void>(`/api/smart/notifications/${id}`),
};
