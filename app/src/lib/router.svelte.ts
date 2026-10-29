// Hash routing by hand: six screens, no library. "#/settings", "#/journal", "#/register",
// "#/radio" and "#/send" are routes; anything else is home. Later tasks add their screen to
// `Route` and `parseHash`.

export type Route = "home" | "settings" | "journal" | "register" | "radio" | "send";

export function parseHash(hash: string): Route {
  if (hash === "#/settings") {
    return "settings";
  }
  if (hash === "#/send") {
    return "send";
  }
  if (hash === "#/journal") {
    return "journal";
  }
  if (hash === "#/register") {
    return "register";
  }
  if (hash === "#/radio") {
    return "radio";
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
