// The one wait primitive the radio layer needs: "resolve this when the next frame arrives".
// A transport receives frames from a stream reader or a notification event and the link
// waits for them; without a resolver there is no way to express that wait as linear
// async/await. tasks/CONVENTIONS.md bans `new Promise` wrappers in app logic; this file is
// the single, explicit exception, so the rest of src/radio/ can stay plain `await`.

export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  // eslint-disable-next-line no-restricted-syntax -- the one resolver the transports need; see the header
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
