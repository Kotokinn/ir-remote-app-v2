import { apiPost } from "@/lib/api/http";

export interface DeviceResponse {
  deviceId: string;
  name: string;
  claimedAt: string;
}

export interface CommandAcceptedResponse {
  requestId: string;
}

// mqtt-service holds this request open for up to ~60s waiting for the device to actually come online
// (WiFi test + reboot + reconnect + MQTT connect + claim) — longer than apiPost's default 20s timeout,
// which was aborting the request client-side before the server ever got to reply ("Request canceled"
// instead of the proper 408 that offlineAfterRestart already handles). Give it real margin over that.
const CLAIM_TIMEOUT_MS = 65_000;

/** Publishes the "claim" command and blocks (mqtt-service-side timeout, ~60s) until the device claims itself. */
export function startClaim(
  deviceId: string,
  name: string,
): Promise<DeviceResponse> {
  return apiPost<DeviceResponse>(
    "/api/mqtt/claim/start",
    { deviceId, name },
    CLAIM_TIMEOUT_MS,
  );
}

export interface PingResponse {
  online: boolean;
}

/**
 * Direct, bounded liveness check — bypasses the SSE stream entirely (see device-state-store.ts's
 * confirmReachable). mqtt-service blocks briefly on a real MQTT round trip server-side, so the
 * result doesn't depend on whether this app's own stream connection happens to be stuck right now.
 */
export function pingDevice(deviceId: string): Promise<PingResponse> {
  return apiPost<PingResponse>(`/api/mqtt/devices/${deviceId}/ping`, {}, 6_000);
}

export function sendCommand(
  deviceId: string,
  method: string,
  params?: unknown,
): Promise<CommandAcceptedResponse> {
  return apiPost<CommandAcceptedResponse>(
    `/api/mqtt/devices/${deviceId}/commands`,
    { method, params },
  );
}

export function setConfig(
  deviceId: string,
  patch: Record<string, unknown>,
): Promise<void> {
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

export function setSchedule(
  deviceId: string,
  schedule: ScheduleRequest,
): Promise<void> {
  return apiPost<void>(`/api/mqtt/devices/${deviceId}/schedule`, schedule);
}
