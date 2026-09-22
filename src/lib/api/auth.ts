import { fetch } from "@tauri-apps/plugin-http";

import { API_BASE_URL } from "@/lib/api/config";

export interface AccountInfo {
  id: number;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
  account: AccountInfo;
}

export interface ApiErrorBody {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
}

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, body?: ApiErrorBody) {
    super(body?.message ?? `Request failed with status ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => undefined)) as ApiErrorBody | undefined;
    throw new ApiError(response.status, errorBody);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  return post<AuthResponse>("/api/auth/google", { idToken });
}

export function refreshToken(refreshTokenValue: string): Promise<AuthResponse> {
  return post<AuthResponse>("/api/auth/refresh", { refreshToken: refreshTokenValue });
}
