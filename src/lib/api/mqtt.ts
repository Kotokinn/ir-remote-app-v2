import { apiPost } from "@/lib/api/http";

export interface DeviceResponse {
  deviceId: string;
  name: string;
  claimedAt: string;
}

export interface CommandAcceptedResponse {
  requestId: string;
}

/** Publishes the "claim" command and blocks (mqtt-service-side timeout) until the device claims itself. */
export function startClaim(deviceId: string, name: string): Promise<DeviceResponse> {
  return apiPost<DeviceResponse>("/api/mqtt/claim/start", { deviceId, name });
}

export function sendCommand(
  deviceId: string,
  method: string,
  params?: Record<string, unknown>
): Promise<CommandAcceptedResponse> {
  return apiPost<CommandAcceptedResponse>(`/api/mqtt/devices/${deviceId}/commands`, { method, params });
}

export function setConfig(deviceId: string, patch: Record<string, unknown>): Promise<void> {
  return apiPost<void>(`/api/mqtt/devices/${deviceId}/config`, patch);
}

export interface ScheduleAction {
  method: string;
  params?: Record<string, unknown>;
}

export interface ScheduleRequest {
  repeat: boolean;
  startTime?: string;
  startAction?: ScheduleAction[];
  endTime?: string;
  endAction?: ScheduleAction[];
  days?: number[];
}

export function setSchedule(deviceId: string, schedule: ScheduleRequest): Promise<void> {
  return apiPost<void>(`/api/mqtt/devices/${deviceId}/schedule`, schedule);
}
