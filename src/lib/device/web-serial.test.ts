// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWebSerialSupported,
  listGrantedPorts,
  requestNewPort,
  sendCommandOverWebSerial,
} from "./web-serial";

/** A minimal fake SerialPort: a duplex byte pipe plus getInfo(), just enough to drive the module under test. */
function fakePort(info: { usbVendorId?: number; usbProductId?: number } = { usbVendorId: 0x1a86, usbProductId: 0x7523 }) {
  let opened = false;
  const written: Uint8Array[] = [];
  const replyQueue: Uint8Array[] = [];

  const port = {
    getInfo: () => info,
    open: vi.fn(async () => {
      opened = true;
    }),
    close: vi.fn(async () => {
      opened = false;
    }),
    get readable() {
      if (!opened) return null;
      return {
        getReader: () => {
          let cancelled = false;
          return {
            read: async () => {
              while (replyQueue.length === 0 && !cancelled) {
                await new Promise((resolve) => setTimeout(resolve, 1));
              }
              if (cancelled) return { value: undefined, done: true };
              return { value: replyQueue.shift(), done: false };
            },
            cancel: async () => {
              cancelled = true;
            },
            releaseLock: () => undefined,
          };
        },
      };
    },
    get writable() {
      if (!opened) return null;
      return {
        getWriter: () => ({
          write: async (chunk: Uint8Array) => {
            written.push(chunk);
          },
          releaseLock: () => undefined,
        }),
      };
    },
    // test helpers, not part of the real SerialPort interface
    _written: written,
    _reply(text: string) {
      replyQueue.push(new TextEncoder().encode(text));
    },
  };
  return port;
}

function textOf(chunks: Uint8Array[]): string {
  return chunks.map((c) => new TextDecoder().decode(c)).join("");
}

/** The fake above only implements the slice of SerialPort this module actually uses — cast it once here
 * rather than fully typing out every field (onconnect, setSignals, ...) real SerialPort also has. */
function stubGrantedPorts(...ports: Array<ReturnType<typeof fakePort>>): void {
  navigator.serial.getPorts = vi.fn(async () => ports as unknown as SerialPort[]);
}

function stubRequestedPort(port: ReturnType<typeof fakePort>): void {
  navigator.serial.requestPort = vi.fn(async () => port as unknown as SerialPort);
}

beforeEach(() => {
  vi.stubGlobal("navigator", { serial: { getPorts: vi.fn(async () => []), requestPort: vi.fn() } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isWebSerialSupported", () => {
  it("is true only when navigator.serial exists", () => {
    expect(isWebSerialSupported()).toBe(true);
    vi.stubGlobal("navigator", {});
    expect(isWebSerialSupported()).toBe(false);
  });
});

describe("listGrantedPorts / requestNewPort", () => {
  it("lists already-granted ports by a stable vendor:product id, without asking again", async () => {
    const port = fakePort({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
    stubGrantedPorts(port);

    const ports = await listGrantedPorts();

    expect(ports).toEqual(["USB 1a86:7523"]);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- a vi.fn() spy, not a real bound method
    expect(navigator.serial.requestPort).not.toHaveBeenCalled();
  });

  it("requestNewPort opens the native chooser and returns the same id listGrantedPorts would give it", async () => {
    const port = fakePort({ usbVendorId: 0x0403, usbProductId: 0x6001 });
    stubRequestedPort(port);
    stubGrantedPorts(port);

    const id = await requestNewPort();

    expect(id).toBe("USB 0403:6001");
  });

  it("falls back to a positional id for a non-USB port (no vendor/product id at all)", async () => {
    const port = fakePort({});
    stubGrantedPorts(port);

    expect(await listGrantedPorts()).toEqual(["Port 1"]);
  });
});

describe("sendCommandOverWebSerial", () => {
  it("opens the port, writes the frame plus a newline, reads one line, and closes again", async () => {
    const port = fakePort();
    stubGrantedPorts(port);
    await listGrantedPorts(); // populate the module's id -> port map
    port._reply("ack-frame\n");

    const response = await sendCommandOverWebSerial("USB 1a86:7523", "topic|{}", 9600, 1000);

    expect(response).toBe("ack-frame");
    expect(port.open).toHaveBeenCalledWith({ baudRate: 9600 });
    expect(textOf(port._written)).toBe("topic|{}\n");
    expect(port.close).toHaveBeenCalledTimes(1);
  });

  it("strips a trailing \\r (the firmware's line ending) from the response", async () => {
    const port = fakePort();
    stubGrantedPorts(port);
    await listGrantedPorts();
    port._reply("ack\r\n");

    expect(await sendCommandOverWebSerial("USB 1a86:7523", "topic|{}", 9600, 1000)).toBe("ack");
  });

  it("assembles a response that arrives across more than one read", async () => {
    const port = fakePort();
    stubGrantedPorts(port);
    await listGrantedPorts();
    port._reply("ack-");
    setTimeout(() => {
      port._reply("frame\n");
    }, 5);

    expect(await sendCommandOverWebSerial("USB 1a86:7523", "topic|{}", 9600, 1000)).toBe("ack-frame");
  });

  it("rejects with a clear error when nothing replies before the timeout", async () => {
    const port = fakePort();
    stubGrantedPorts(port);
    await listGrantedPorts();
    // no _reply(): the read just hangs until the module's own timeout cancels it

    await expect(sendCommandOverWebSerial("USB 1a86:7523", "topic|{}", 9600, 20)).rejects.toThrow(/20ms/);
  });

  it("rejects with a named error for a port id nothing granted", async () => {
    await expect(sendCommandOverWebSerial("USB dead:beef", "topic|{}", 9600, 1000)).rejects.toThrow(/USB dead:beef/);
  });
});
