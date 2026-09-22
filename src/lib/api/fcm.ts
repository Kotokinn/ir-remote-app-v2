import { apiPost } from "@/lib/api/http";

export interface FcmTokenResponse {
  id: number;
  platform: "ANDROID" | "IOS" | "WEB";
  deviceName?: string;
  appId?: string;
  enabled: boolean;
}

// firebasefcm-service, routed by the gateway at /api/fcm/**. Registering the same token again just
// refreshes it (and re-assigns it to the calling account), so it is safe to call on every launch.
export const fcmApi = {
  registerToken: (data: {
    token: string;
    platform: FcmTokenResponse["platform"];
    deviceName?: string;
    /** Which app owns the token, so one product's pushes never reach another product's app. */
    appId?: string;
  }) =>
    apiPost<FcmTokenResponse>("/api/fcm/tokens", data),
};
