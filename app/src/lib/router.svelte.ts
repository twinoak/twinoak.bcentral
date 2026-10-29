// Hash routing by hand: seven screens, no library. "#/settings", "#/journal", "#/queue",
// "#/register", "#/radio" and "#/print" (the journal's print view, P1-04) are routes;
// anything else is home. "#/send" (P0-05's stand-in screen, absorbed into the journal screen
// in P0-07) opens the journal, so an old bookmark still lands right. Later tasks add their
// screen to `Route` and `parseHash`.

export type Route = "home" | "settings" | "journal" | "queue" | "register" | "radio" | "print";

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
  if (hash === "#/radio") {
    return "radio";
  }
  if (hash === "#/print") {
    return "print";
  }
  return "home";
}

export function hashFor(route: Route): string {
  return route === "home" ? "#/" : `#/${route}`;
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
