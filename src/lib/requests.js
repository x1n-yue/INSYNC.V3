export const REQUEST_TIMEOUT_MS = 15000;

export async function withTimeout(promise, message = "Request timed out. Refresh to check the latest state before retrying.", milliseconds = REQUEST_TIMEOUT_MS) {
  let timer;
  try {
    return await Promise.race([Promise.resolve(promise), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

export async function captureRequest(promise) {
  try { return await withTimeout(promise); }
  catch (error) { return { data: null, error }; }
}

// Abort real HTTP requests as well as bounding callers that wait on SDK locks.
// No automatic mutation retries: a response can be lost after a commit.
export async function timedFetch(input, options = {}) {
  const controller = new AbortController();
  const source = options.signal ?? input?.signal;
  const abort = () => controller.abort(source?.reason);
  if (source?.aborted) abort();
  else source?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Request timed out. Refresh before retrying.")), REQUEST_TIMEOUT_MS);
  try { return await fetch(input, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); source?.removeEventListener("abort", abort); }
}
