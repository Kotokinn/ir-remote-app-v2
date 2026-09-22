import { openUrl } from "@tauri-apps/plugin-opener";
import { onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { API_BASE_URL } from "@/lib/api/config";
import { useAuthStore } from "@/lib/store/auth-store";

const APP_REDIRECT_SCHEME = "smarthome";
const SIGN_IN_TIMEOUT_MS = 3 * 60 * 1000;

// Server-mediated OAuth2 login: the app never talks to Google directly. It opens
// auth-service's own /oauth2/authorization/google (Spring Security's OAuth2 Client
// login, GGL-014 infra) in the system browser; Google redirects straight back to
// auth-service (a real client_secret held server-side, no PKCE needed client-side),
// which mints this app's own JWT/refreshToken and redirects the browser to
// smarthome://auth/complete?accessToken=...&refreshToken=... - our own redirect,
// not Google's, so a custom URI scheme is fine here (Google's 2022 restriction only
// applies to what Google itself redirects to).
function waitForAppCallback(): Promise<{ accessToken: string | null; refreshToken: string | null; error: string | null }> {
  return new Promise((resolve, reject) => {
    let unlisten: (() => void) | undefined;
    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error("Google sign-in timed out"));
    }, SIGN_IN_TIMEOUT_MS);

    onOpenUrl((urls) => {
      for (const raw of urls) {
        if (!raw.startsWith(`${APP_REDIRECT_SCHEME}://`)) continue;
        const url = new URL(raw);
        clearTimeout(timer);
        unlisten?.();
        resolve({
          accessToken: url.searchParams.get("accessToken"),
          refreshToken: url.searchParams.get("refreshToken"),
          error: url.searchParams.get("error"),
        });
        return;
      }
    })
      .then((stop) => {
        unlisten = stop;
      })
      .catch(reject);
  });
}

export async function signInWithGoogle(): Promise<void> {
  const callbackPromise = waitForAppCallback();
  await openUrl(`${API_BASE_URL}/oauth2/authorization/google`);

  const { accessToken, refreshToken, error } = await callbackPromise;
  if (error || !accessToken || !refreshToken) {
    throw new Error(error ?? "Google sign-in was cancelled");
  }

  useAuthStore.getState().setSession(accessToken, refreshToken);
}
