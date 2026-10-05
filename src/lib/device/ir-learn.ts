"use client";

import { sendCommand } from "@/lib/api/mqtt";
import { sendDeviceCommand } from "@/lib/device/device-commands";
import { useDeviceStateStore } from "@/lib/store/device-state-store";

/**
 * A learned IR code, as the hub encodes it: base64 of a lossless binary form of the captured µs samples
 * (see hub-ir/include/IR_CODEC.h). Kept opaque on the app side — stored as-is and sent back unchanged.
 */
export interface LearnedIr {
  base64: string;
}

// Must match IR_CODE_CHUNK_CHARS in hub-ir/include/CONFIG.h (a multiple of 4).
const CHUNK_CHARS = 240;

// Firmware waits at most IR_LEARN_MAX_TIMEOUT_MS (20s) and answers on command-response. The extra margin
// covers the round trip, and a silent hub (no SSE, device off) gives up here instead of hanging forever.
const RESPONSE_MARGIN_MS = 5_000;

interface LearnReply {
  requestId?: unknown;
  success?: unknown;
  message?: unknown;
  part?: unknown;
  parts?: unknown;
  base64?: unknown;
}

/**
 * Asks the hub to learn one IR button from the user's original remote. The answer comes back on the device
 * stream (command-response), possibly split into several messages (part/parts). They're matched by the
 * requestId the server assigned, and reassembled in order here.
 */
export async function learnIr(
  deviceId: string,
  timeoutMs = 10_000,
): Promise<LearnedIr> {
  const { requestId } = await sendCommand(deviceId, "learnIr", { timeoutMs });

  return new Promise<LearnedIr>((resolve, reject) => {
    const chunks = new Map<number, string>();
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new Error("no response from hub"));
      });
    }, timeoutMs + RESPONSE_MARGIN_MS);

    const unsubscribe = useDeviceStateStore.subscribe((store) => {
      // Partial: a device with no events yet is simply absent (Record<string, T> index types hide that).
      const devices: Partial<typeof store.devices> = store.devices;
      const reply = devices[deviceId]?.lastCommandResponse as
        | LearnReply
        | undefined;
      if (!reply || reply.requestId !== requestId) return;

      if (reply.success !== true) {
        finish(() => {
          reject(
            new Error(
              typeof reply.message === "string"
                ? reply.message
                : "learn failed",
            ),
          );
        });
        return;
      }

      if (
        typeof reply.part !== "number" ||
        typeof reply.parts !== "number" ||
        typeof reply.base64 !== "string"
      ) {
        return;
      }
      const total = reply.parts;
      chunks.set(reply.part, reply.base64);

      if (chunks.size === total) {
        const ordered: string[] = [];
        for (let i = 0; i < total; i++) {
          const piece = chunks.get(i);
          if (piece === undefined) return;
          ordered.push(piece);
        }
        finish(() => {
          resolve({ base64: ordered.join("") });
        });
      }
    });
  });
}

/**
 * Replays a learned button. The code is sent in chunks (the hub reassembles them by index, so order doesn't
 * matter), each one a normal command over whichever path reaches the hub (MQTT, else BLE).
 */
export async function sendLearnedIr(
  deviceId: string,
  ir: LearnedIr,
): Promise<void> {
  const transferId = crypto.randomUUID();
  const parts = Math.ceil(ir.base64.length / CHUNK_CHARS);

  for (let part = 0; part < parts; part++) {
    const chunk = ir.base64.slice(part * CHUNK_CHARS, (part + 1) * CHUNK_CHARS);
    await sendDeviceCommand(deviceId, "sendIrCode", {
      transferId,
      part,
      parts,
      base64: chunk,
    });
  }
}
