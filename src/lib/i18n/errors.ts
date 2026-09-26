import { ApiError } from "@/lib/api/auth";
import { i18n } from "@/lib/i18n";

/**
 * The text to show for a failure. A server error with a known `code` is translated ("apiError.<CODE>", filled
 * with the response's `params`); anything else falls back to the error's own message, then to `fallback`.
 */
export function errorMessage(error: unknown, fallback?: string): string {
  if (error instanceof ApiError && error.code) {
    const key = `apiError.${error.code}`;
    // The key is only known at runtime (whatever code the server sent), so it can't be type-checked.
    if (i18n.exists(key)) {
      const text: unknown = i18n.t(key as never, { ...error.params } as never);
      if (typeof text === "string") return text;
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback ?? i18n.t("sync.err.unknown");
}
