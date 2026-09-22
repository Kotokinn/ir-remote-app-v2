import { fetch } from "@tauri-apps/plugin-http";
import { useAuthStore } from "@/lib/store/auth-store";
import { ApiError, type ApiErrorBody } from "@/lib/api/auth";
import { API_BASE_URL } from "@/lib/api/config";

export { ApiError };

async function rawRequest(path: string, options: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, { ...options, headers });
}

async function toResult<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new ApiError(response.status, errorBody);
  }
  // 202 (e.g. mqtt-service accepting a command) carries nothing the callers use.
  if (response.status === 202 || response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const state = useAuthStore.getState();
  let response = await rawRequest(path, options, state.accessToken);

  if (response.status === 401 && state.refreshToken) {
    try {
      const newToken = await state.refreshAccessToken();
      response = await rawRequest(path, options, newToken);
    } catch {
      state.logout();
      throw new ApiError(401);
    }
  }

  return toResult<T>(response);
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
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
