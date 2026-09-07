import { AsyncLocalStorage } from "node:async_hooks";

const freshAuthorization = new AsyncLocalStorage<boolean>();
export function needsFreshAuthorization() {
  return freshAuthorization.getStore() === true;
}
export function withFreshAuthorization<T>(
  callback: () => Promise<T>,
): Promise<T> {
  return freshAuthorization.run(true, callback);
}
