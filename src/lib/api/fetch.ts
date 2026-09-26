import { fetch as nativeFetch } from "@tauri-apps/plugin-http";
import { runsInApp } from "@/lib/platform";

/**
 * fetch for API calls. In the installed app it goes through Tauri's HTTP plugin (no CORS, works against any
 * origin); in a browser it is the browser's own fetch, so the api-gateway must allow the page's origin
 * (GATEWAY_CORS_ALLOWED_ORIGINS).
 */
export function appFetch(input: string, init?: RequestInit): Promise<Response> {
  return runsInApp() ? nativeFetch(input, init) : fetch(input, init);
}
