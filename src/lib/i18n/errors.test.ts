// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/auth";
import { i18n } from "@/lib/i18n";
import vi from "./locales/vi.json";
import { errorMessage } from "./errors";

function serverError(status: number, code: string | undefined, message: string, params?: Record<string, unknown>) {
  return new ApiError(status, { timestamp: "", status, error: "", code, message, params });
}

describe("errorMessage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates a server error by its code, filling in the params", () => {
    const error = serverError(403, "DEVICE_OWNER_ONLY_FIELD", "Only the owner can change roomId", { field: "roomId" });
    expect(errorMessage(error)).toBe("Only the owner can change roomId");
  });

  it("uses the current language", async () => {
    i18n.addResourceBundle("vi", "translation", vi);
    await i18n.changeLanguage("vi");
    const error = serverError(400, "AUTH_OTP_RESEND_TOO_SOON", "OTP can only be resent after 60 seconds", { seconds: 60 });
    expect(errorMessage(error)).toBe("Chỉ có thể gửi lại OTP sau 60 giây");
  });

  it("falls back to the server's English message for a code the app doesn't know yet", () => {
    expect(errorMessage(serverError(400, "SOMETHING_NEW", "Something new went wrong"))).toBe("Something new went wrong");
  });

  it("falls back to the message for an error without a code", () => {
    expect(errorMessage(serverError(400, undefined, "Plain message"))).toBe("Plain message");
  });

  it("uses the fallback for things that aren't errors at all", () => {
    expect(errorMessage("boom", "Couldn't do it")).toBe("Couldn't do it");
  });
});
