/**
 * Server-sent events over fetch, for the browser build. (The installed app reads these streams in Rust; a
 * browser's EventSource can't send the Authorization header the stream endpoints need.) Emits the same
 * {event, data} shape as the Rust side, including the "open" / "error" pseudo-events, and reconnects by itself.
 */
export interface SseEvent {
  event: string;
  data: string;
}

/** Feeds raw text chunks in, gets whole events out (an event ends at a blank line). */
export class SseParser {
  private buffer = "";

  push(chunk: string): SseEvent[] {
    this.buffer += chunk;
    const events: SseEvent[] = [];
    for (;;) {
      const boundary = /\r\n\r\n|\n\n|\r\r/.exec(this.buffer);
      if (!boundary) break;
      const block = this.buffer.slice(0, boundary.index);
      this.buffer = this.buffer.slice(boundary.index + boundary[0].length);
      const event = parseBlock(block);
      if (event) events.push(event);
    }
    return events;
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (line === "" || line.startsWith(":")) continue; // blank / comment (keep-alive)
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length === 0 ? null : { event, data: data.join("\n") };
}

const MIN_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * Opens `url` and keeps it open, calling onEvent for everything that arrives. The token is read afresh on
 * every (re)connect, so a refreshed one is picked up. Returns the function that stops it for good.
 */
export function startSse(url: string, getToken: () => string | null, onEvent: (event: SseEvent) => void): () => void {
  const controller = new AbortController();
  const { signal } = controller;
  // A function, not `signal.aborted` inline: the loop condition would make control-flow analysis treat it as always false.
  const stopped = () => signal.aborted;

  async function run() {
    let retryMs = MIN_RETRY_MS;
    while (!stopped()) {
      try {
        const token = getToken();
        const response = await fetch(url, {
          headers: { Accept: "text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          signal,
        });
        if (!response.ok || !response.body) {
          // Same wording as reqwest-eventsource, which callers already match on (e.g. "404").
          onEvent({ event: "error", data: `Invalid status code: ${response.status} ${response.statusText}` });
        } else {
          retryMs = MIN_RETRY_MS;
          onEvent({ event: "open", data: "{}" });
          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          const parser = new SseParser();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const event of parser.push(value)) onEvent(event);
          }
          onEvent({ event: "error", data: "stream ended" });
        }
      } catch (error) {
        if (stopped()) return;
        onEvent({ event: "error", data: error instanceof Error ? error.message : String(error) });
      }
      await wait(retryMs, signal);
      retryMs = Math.min(retryMs * 2, MAX_RETRY_MS);
    }
  }

  void run();
  return () => {
    controller.abort();
  };
}
