// src/lib/auth-serializer.ts

const locks = new Map<string, Promise<unknown>>();
const LOCK_TIMEOUT_MS = 30_000; // 30s max lock duration

/**
 * Serialize async operations per session/key.
 * If an operation for the given key is already in-flight, the new caller
 * waits for it to complete rather than executing concurrently.
 *
 * Includes a 30-second timeout to release stuck locks.
 */
export async function serializeAuthRequest<T>(
  sessionKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  // Wait for any existing operation to complete
  const existing = locks.get(sessionKey);
  if (existing) {
    await existing.catch(() => {}); // swallow errors from the previous op
  }

  // Create a new promise for this operation with a timeout
  let resolve: (value: T) => void;
  let reject: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  locks.set(sessionKey, promise);

  // Timeout safety — release lock after 30s
  const timeoutId = setTimeout(() => {
    locks.delete(sessionKey);
    reject(new Error("Auth serialization timeout"));
  }, LOCK_TIMEOUT_MS);

  try {
    const result = await operation();
    resolve!(result);
    return result;
  } catch (err) {
    reject!(err);
    throw err;
  } finally {
    clearTimeout(timeoutId);
    // Only delete if this is still OUR lock
    if (locks.get(sessionKey) === promise) {
      locks.delete(sessionKey);
    }
  }
}
