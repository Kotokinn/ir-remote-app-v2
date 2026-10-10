// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseClaimLabel } from "./claim-label";

describe("parseClaimLabel", () => {
  it("reads the serial and code from the label link, whatever the host or scheme", () => {
    expect(
      parseClaimLabel(
        "https://smart.example.com/claim?s=SMI-100123&c=K7F3M9QX2A",
      ),
    ).toEqual({
      serial: "SMI-100123",
      code: "K7F3M9QX2A",
    });
    expect(
      parseClaimLabel("  smarthome://claim?s=SMS-100124&c=ABCDE12345 "),
    ).toEqual({
      serial: "SMS-100124",
      code: "ABCDE12345",
    });
  });

  it("ignores anything that isn't a claim label", () => {
    expect(parseClaimLabel("smarthome://join?code=ABCD1234")).toBeNull();
    expect(parseClaimLabel("https://example.com/claim?s=SMI-1")).toBeNull();
    expect(parseClaimLabel("SMI-100123")).toBeNull();
    expect(parseClaimLabel("not a url://")).toBeNull();
  });
});
