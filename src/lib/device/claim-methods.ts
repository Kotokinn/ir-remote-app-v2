import type { PhysicalProductType } from "@/lib/store/hubs-store";

/**
 * How a device can be added: over Bluetooth (stand next to it, hold its button; it signs a nonce) or
 * with the QR label in its box / under it. Not every product has both — one without Bluetooth gets its
 * network another way, one without a label is only added over Bluetooth — so each product lists its own.
 * Order = how they are offered.
 */
export type ClaimMethod = "ble" | "qr";

export const CLAIM_METHODS: Record<
  PhysicalProductType,
  readonly ClaimMethod[]
> = {
  "hub-ir": ["ble"],
  relay8: ["ble", "qr"],
};

export function claimMethodsFor(
  product: PhysicalProductType,
): readonly ClaimMethod[] {
  return CLAIM_METHODS[product];
}
