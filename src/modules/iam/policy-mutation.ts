import { AsyncLocalStorage } from "node:async_hooks";
import { withFreshAuthorization } from "@/server/domain/services/authorization.fresh-context";
import { withPostgresAdvisoryLock } from "@/server/infrastructure/db";

const mutationContext = new AsyncLocalStorage<boolean>();

/** Serialize policy writes across processes and re-read permissions after acquiring the lock.
 * Nested operations reuse the same lock. This also protects last-owner checks.
 */
export function policyMutation<A extends unknown[], R>(
  operation: (...args: A) => Promise<R>,
) {
  return async (...args: A): Promise<R> => {
    if (mutationContext.getStore()) return operation(...args);
    return withPostgresAdvisoryLock("iam:policy-mutation", () =>
      mutationContext.run(true, () =>
        withFreshAuthorization(() => operation(...args)),
      ),
    );
  };
}
