/**
 * A device's claim label (docs/FIRMWARE_INTEGRATION.md, section 5): the QR holds a link
 * `<anything>?s=<serial>&c=<code>`, e.g. `https://…/claim?s=SMI-100123&c=K7F3M9QX2A` or
 * `smarthome://claim?s=…&c=…`. Null for anything else (an invite QR, a random link).
 */
export interface ClaimLabel {
  serial: string;
  code: string;
}

export function parseClaimLabel(text: string): ClaimLabel | null {
  const trimmed = text.trim();
  if (!trimmed.includes("://")) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  const serial = url.searchParams.get("s")?.trim();
  const code = url.searchParams.get("c")?.trim();
  if (!serial || !code || serial.length > 30 || code.length > 30) return null;
  return { serial, code };
}
