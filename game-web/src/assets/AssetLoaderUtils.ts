/// <reference types="vite/client" />

/**
 * Resolves asset URLs consistently under Vite's `base: './'` or subpath deployments.
 */
export function resolveAssetUrl(url: string): string {
  if (!url) return url;
  if (/^(https?:|data:|blob:|\/\/|\.{1,2}\/)/i.test(url)) {
    return url;
  }
  if (url.startsWith('/')) {
    const base =
      typeof import.meta !== 'undefined' && typeof import.meta.env?.BASE_URL === 'string'
        ? import.meta.env.BASE_URL
        : './';
    if (!base || base === '.' || base === './') {
      return `.${url}`;
    }
    return `${base.replace(/\/+$/, '')}${url}`;
  }
  return url;
}

/**
 * Races a promise against a timeout so stalled network/WASM operations cannot hang boot forever.
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      reject(new Error(`Timeout (${timeoutMs}ms): ${label}`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
  });
}

/**
 * Fetches an asset URL (normalized via `resolveAssetUrl`) with an abort timeout.
 */
export async function fetchWithTimeout(
  url: string,
  timeoutMs = 15000,
  init?: RequestInit
): Promise<Response> {
  const resolvedUrl = resolveAssetUrl(url);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController === 'undefined') {
    return withTimeout(fetch(resolvedUrl, init), timeoutMs, `fetch ${resolvedUrl}`);
  }

  const controller = new AbortController();
  const externalSignal = init?.signal;
  const onExternalAbort = (): void => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  const timerId = setTimeout(() => {
    controller.abort(new Error(`Timeout (${timeoutMs}ms): fetch ${resolvedUrl}`));
  }, timeoutMs);

  try {
    return await fetch(resolvedUrl, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timerId);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

/**
 * Runs async tasks over `items` with a bounded concurrency pool while preserving result order.
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const concurrency = Math.max(1, Math.min(items.length, Math.floor(limit) || 1));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: concurrency }, async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await worker(items[idx], idx);
    }
  });

  await Promise.all(runners);
  return results;
}
