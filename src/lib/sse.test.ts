// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

describe("SseParser", () => {
  it("reads named events, and events split across chunks", () => {
    const parser = new SseParser();
    expect(parser.push('event: telemetry\ndata: {"temp":')).toEqual([]);
    expect(parser.push('21}\n\nevent: state\ndata: {"online":true}\n\n')).toEqual([
      { event: "telemetry", data: '{"temp":21}' },
      { event: "state", data: '{"online":true}' },
    ]);
  });

  it("defaults the event name to message and joins multi-line data", () => {
    expect(new SseParser().push("data: one\ndata: two\n\n")).toEqual([{ event: "message", data: "one\ntwo" }]);
  });

  it("ignores comments (keep-alives) and blocks without data", () => {
    expect(new SseParser().push(": keep-alive\n\nevent: ready\n\n")).toEqual([]);
  });

  it("copes with CRLF line endings", () => {
    expect(new SseParser().push("event: ping\r\ndata: {}\r\n\r\n")).toEqual([{ event: "ping", data: "{}" }]);
  });

  it("does not strip more than one space after the colon", () => {
    expect(new SseParser().push("data:  two spaces\n\n")).toEqual([{ event: "message", data: " two spaces" }]);
  });
});
