import { ApiError, type ApiErrorBody } from "@/lib/api/auth";
import { API_BASE_URL } from "@/lib/api/config";
import { appFetch } from "@/lib/api/fetch";
import { useAuthStore } from "@/lib/store/auth-store";

export { ApiError };

// A server that accepts the connection and then never answers must not hang a caller forever (the
// sync outbox retries anything that fails, so a timeout has to look like a failure to it).
const REQUEST_TIMEOUT_MS = 20_000;

async function rawRequest(
  path: string,
  options: RequestInit,
  token: string | null,
  timeoutMs: number,
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return appFetch(`${API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(timeoutMs),
    ...options,
    headers,
  });
}

async function toResult<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as
      | ApiErrorBody
      | undefined;
    throw new ApiError(response.status, errorBody);
  }
  // 202 (e.g. mqtt-service accepting a command) carries nothing the callers use.
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const state = useAuthStore.getState();
  let response = await rawRequest(path, options, state.accessToken, timeoutMs);

  if (response.status === 401 && state.refreshToken) {
    let newToken: string;
    try {
      newToken = await state.refreshAccessToken();
    } catch (refreshError) {
      // Only a refresh token the server actually rejects ends the session. A network failure or a server
      // error while refreshing says nothing about the session — signing out then would throw the user out
      // (and strand their unsynced changes) just because the connection dropped at the wrong moment.
      if (
        refreshError instanceof ApiError &&
        refreshError.status >= 400 &&
        refreshError.status < 500
      ) {
        state.logout();
        throw new ApiError(401);
      }
      throw refreshError;
    }
    response = await rawRequest(path, options, newToken, timeoutMs);
  }

  return toResult<T>(response);
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

// timeoutMs: override the default 20s for one-off calls whose server-side work can legitimately take
// longer (e.g. mqtt-service's claim/start blocks on the device, see lib/api/mqtt.ts startClaim()) — the
// default is right for everything else and most callers never need to touch this.
export function apiPost<T>(
  path: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<T> {
  return apiRequest<T>(
    path,
    {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    timeoutMs,
  );
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PUT", body: JSON.stringify(body) });
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}
