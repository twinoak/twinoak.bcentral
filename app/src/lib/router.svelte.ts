// Hash routing by hand: nine screens, no library. "#/settings", "#/journal", "#/queue",
// "#/register", "#/register/print" (the register's print view, P1-06), "#/radio",
// "#/print" (the journal's print view, P1-04), "#/handover" (the shift handover, P1-08) and
// "#/styleguide" (the design language's style guide, P2-01; not in the navigation) are
// routes; anything else — "#/", no hash, an unknown one — is the journal (P2-02: there is no
// home page; the journal is where the work is). "#/send" (P0-05's stand-in screen, absorbed
// into the journal screen in P0-07) opens the journal too, so an old bookmark still lands
// right. Later tasks add their screen to `Route`, `parseHash` and `hashFor`.

export type Route =
  | "settings"
  | "journal"
  | "queue"
  | "register"
  | "printRegister"
  | "radio"
  | "print"
  | "handover"
  | "styleguide";

const PRINT_REGISTER_HASH = "#/register/print";

export function parseHash(hash: string): Route {
  if (hash === "#/settings") {
    return "settings";
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
  if (hash === "#/styleguide") {
    return "styleguide";
  }
  return "journal";
}

export function hashFor(route: Route): string {
  if (route === "printRegister") {
    return PRINT_REGISTER_HASH;
  }
  return `#/${route}`;
}

let current: Route = $state(typeof location === "undefined" ? "journal" : parseHash(location.hash));

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
