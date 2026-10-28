// Hash routing by hand: four screens at most, no library. "#/settings" is a route;
// anything else is home. Later tasks add their screen to `Route` and `parseHash`.

export type Route = "home" | "settings";

export function parseHash(hash: string): Route {
  return hash === "#/settings" ? "settings" : "home";
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
