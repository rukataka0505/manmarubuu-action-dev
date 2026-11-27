const CACHE_NAME = 'manmarubuu-pwa-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('manmarubuu-pwa-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isDevRequest(url) {
  const path = url.pathname;
  return (
    path.startsWith('/@vite') ||
    path.startsWith('/@fs') ||
    path.startsWith('/@id') ||
    path.startsWith('/src/') ||
    path.startsWith('/node_modules/') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import')
  );
}

function isCacheablePwaMeta(url) {
  const path = url.pathname;
  return path.endsWith('/manifest.webmanifest') || path.includes('/icons/');
}

function buildOfflineResponse() {
  const html = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
    />
    <title>まんまるぶう：接続エラー</title>
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background:
          radial-gradient(circle at 50% 34%, rgba(255, 255, 255, 0.92) 0%, rgba(255, 245, 224, 0.72) 48%, rgba(255, 214, 228, 0.94) 100%),
          linear-gradient(160deg, #fff8eb 0%, #ffe6cc 52%, #ffd4e3 100%);
        color: #4d2c1b;
        font-family: 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', 'Yu Gothic UI', sans-serif;
      }
      .offline-card {
        width: min(440px, 88vw);
        padding: 24px 22px;
        border-radius: 26px;
        border: 4px solid #ffffff;
        background: linear-gradient(180deg, rgba(255, 252, 244, 0.98) 0%, rgba(255, 238, 206, 0.96) 100%);
        box-shadow:
          0 0 0 4px #f3c17a,
          0 10px 0 #c98642,
          0 20px 38px rgba(92, 46, 20, 0.24);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
      }
      .offline-title {
        font-size: clamp(17px, 3vw, 20px);
        font-weight: 900;
        color: #d94c74;
      }
      .offline-status {
        font-size: 16px;
        font-weight: 900;
        color: #9e2a4b;
      }
      .offline-desc {
        margin: 0;
        font-size: 13px;
        line-height: 1.55;
        font-weight: 700;
        color: #6b3d24;
      }
      .offline-btn {
        margin-top: 6px;
        appearance: none;
        border: 3px solid #ffffff;
        border-radius: 999px;
        padding: 11px 24px;
        background: linear-gradient(180deg, #ff8ab0 0%, #e84b7a 100%);
        color: #ffffff;
        font-size: 15px;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 5px 0 #b02e56, 0 8px 18px rgba(176, 46, 86, 0.28);
      }
      .offline-btn:active {
        transform: translateY(3px);
        box-shadow: 0 2px 0 #b02e56;
      }
    </style>
  </head>
  <body>
    <main class="offline-card" role="alert">
      <div class="offline-title">まんまるぶう：おもちゃばこ大暴走！</div>
      <div class="offline-status">サーバーに接続できませんでした</div>
      <p class="offline-desc">
        ゲームサーバーが停止しているか、ネットワークにつながっていません。<br />
        接続を確認してから、もういちど読み込んでね。
      </p>
      <button class="offline-btn" type="button" onclick="window.location.reload()">
        🔄 もういちど読み込む
      </button>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: 503,
    statusText: 'Service Unavailable',
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (url.origin !== self.location.origin) return;
  if (isDevRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, {
        cache: 'no-cache',
        credentials: 'same-origin',
      }).catch(() => buildOfflineResponse())
    );
    return;
  }

  if (!isCacheablePwaMeta(url)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok && response.status === 200 && response.type === 'basic') {
          const cloned = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, cloned))
            .catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error()))
  );
});
