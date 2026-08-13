/**
 * fetch() with an abort-based timeout so a hung request surfaces an error
 * instead of leaving the UI spinning forever. Callers may still pass their own
 * `signal`; the timeout is layered on top.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: init.signal ?? controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("The request timed out. Check your connection and try again.");
    }
    throw error instanceof Error ? error : new Error("Network request failed.");
  } finally {
    clearTimeout(timer);
  }
}
