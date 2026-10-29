// Which radio transports this browser can offer (P1-07). Web Serial and Web Bluetooth exist
// in Chromium browsers (Chrome, Edge) and nowhere else; the radio page and the top bar say
// so in one sentence when both are missing, and hide only the transport that is missing when
// one is. Pure, so the four cases are tested without a browser.

import type { TransportKind } from "./serial.ts";

export type TransportSupport = Readonly<Record<TransportKind, boolean>>;

// both  USB and Bluetooth buttons
// usb   only the USB button; the Bluetooth button's place says why
// ble   only the Bluetooth button; the USB button's place says why
// none  no button; one sentence naming the browsers that work
export type RadioCapability = "both" | "usb" | "ble" | "none";

export function transportSupportOf(
  nav: { readonly serial?: unknown; readonly bluetooth?: unknown } | undefined,
): TransportSupport {
  return {
    usb: nav?.serial !== undefined,
    ble: nav?.bluetooth !== undefined,
  };
}

export function capabilityOf(support: TransportSupport): RadioCapability {
  if (support.usb && support.ble) {
    return "both";
  }
  if (support.usb) {
    return "usb";
  }
  if (support.ble) {
    return "ble";
  }
  return "none";
}
