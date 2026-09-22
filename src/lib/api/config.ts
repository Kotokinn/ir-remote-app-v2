// Single backend entry point: the api-gateway routes /api/auth, /api/smart and /api/mqtt (incl. the
// device SSE stream) to the right service, so the app only ever needs this one origin.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:18080";
