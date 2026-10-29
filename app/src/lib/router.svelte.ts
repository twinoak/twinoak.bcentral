// Hash routing by hand: nine screens, no library. "#/settings", "#/journal", "#/queue",
// "#/register", "#/register/print" (the register's print view, P1-06), "#/radio",
// "#/print" (the journal's print view, P1-04) and "#/handover" (the shift handover, P1-08)
// are routes; anything else is home. "#/send" (P0-05's stand-in screen, absorbed into the
// journal screen in P0-07) opens the journal, so an old bookmark still lands right. Later
// tasks add their screen to `Route`, `parseHash` and `hashFor`.

export type Route =
  | "home"
  | "settings"
  | "journal"
  | "queue"
  | "register"
  | "printRegister"
  | "radio"
  | "print"
  | "handover";

const PRINT_REGISTER_HASH = "#/register/print";

export function parseHash(hash: string): Route {
  if (hash === "#/settings") {
    return "settings";
  }
  if (hash === "#/journal" || hash === "#/send") {
    return "journal";
  }
  if (hash === "#/queue") {
    return "queue";
  }
  if (hash === "#/register") {
    return "register";
  }
  if (hash === PRINT_REGISTER_HASH) {
    return "printRegister";
  }
  if (hash === "#/radio") {
    return "radio";
  }
  if (hash === "#/print") {
    return "print";
  }
  if (hash === "#/handover") {
    return "handover";
  }
  return "home";
}

export function hashFor(route: Route): string {
  if (route === "home") {
    return "#/";
  }
  if (route === "printRegister") {
    return PRINT_REGISTER_HASH;
  }
  return `#/${route}`;
}

let current: Route = $state(typeof location === "undefined" ? "home" : parseHash(location.hash));

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    current = parseHash(location.hash);
  });
}

export function route(): Route {
  return current;
}

export function navigate(to: Route): void {
  location.hash = hashFor(to);
}
