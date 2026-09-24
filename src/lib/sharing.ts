// Household sharing rules the UI follows (the server enforces the same ones — see smart-remote-iot's
// AccessView; hiding a control here is convenience, not the security boundary).
//
//  - own thing (access "owner" / unset): everything.
//  - room grant: control everything in that room, configure it (scenes, schedules, alarms), add new
//    devices into it, and rename/remove only what you added yourself.
//  - device grant: control that one device, nothing else.
import type { UserRoom } from "@/lib/store/rooms-store";

/** Room id the server gives devices/hubs a single-device grant exposes — the owner's real room isn't theirs to see. */
export const SHARED_ROOM_ID = "shared";

interface Shared {
  access?: "owner" | "room" | "device";
  canEdit?: boolean;
}

/** Rename / remove. Undefined (a device just built locally) counts as yours. */
export function mayEdit(item: Shared): boolean {
  return item.canEdit !== false;
}

/** Scenes, schedules, alarms, learned remote buttons — anything beyond just driving the device. */
export function mayConfigure(item: Shared): boolean {
  return item.access !== "device";
}

/** Whether the signed-in account can add hubs/devices into this room. */
export function canAddDevicesTo(roomId: string, rooms: UserRoom[]): boolean {
  if (roomId === "all") return true;
  if (roomId === SHARED_ROOM_ID) return false;
  return rooms.some((room) => room.id === roomId);
}

/**
 * The invite code inside whatever a scan or a link gave us: a `smarthome://join?code=…` link (the QR
 * the owner shows), or just the bare code. Null for anything else.
 */
export function parseInviteCode(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.includes("://")) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== "smarthome:" || url.hostname !== "join") return null;
      return url.searchParams.get("code");
    } catch {
      return null;
    }
  }
  const bare = trimmed.toUpperCase().replace(/-/g, "");
  return /^[A-Z0-9]{6,12}$/.test(bare) ? bare : null;
}
