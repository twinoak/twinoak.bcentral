import { describe, expect, it } from "vitest";
import { capabilityOf, transportSupportOf } from "./capability.ts";

describe("radio capability (P1-07)", () => {
  it("both APIs present: both buttons", () => {
    const support = transportSupportOf({ serial: {}, bluetooth: {} });
    expect(support).toEqual({ usb: true, ble: true });
    expect(capabilityOf(support)).toBe("both");
  });

  it("both APIs missing (Firefox, Safari): the one capability message, no button", () => {
    expect(capabilityOf(transportSupportOf({}))).toBe("none");
    expect(capabilityOf(transportSupportOf(undefined))).toBe("none");
  });

  it("only Bluetooth missing: the USB button only", () => {
    const support = transportSupportOf({ serial: {} });
    expect(support).toEqual({ usb: true, ble: false });
    expect(capabilityOf(support)).toBe("usb");
  });

  it("only Web Serial missing: the Bluetooth button only", () => {
    expect(capabilityOf(transportSupportOf({ bluetooth: {} }))).toBe("ble");
  });
});
