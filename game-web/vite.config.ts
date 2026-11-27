import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const OGP_IMAGE_FILE = 'ogp.jpg';

function firstHeaderValue(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  return raw.split(',')[0]?.trim() ?? '';
}

function parseForwardedHeader(header: string): { proto?: string; host?: string } {
  const result: { proto?: string; host?: string } = {};
  const firstEntry = header.split(',')[0];
  if (!firstEntry) return result;
  for (const part of firstEntry.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = part.slice(eq + 1).trim().replace(/^"|"$/g, '');
    if (key === 'proto' && (val === 'http' || val === 'https')) {
      result.proto = val;
    } else if (key === 'host' && val) {
      result.host = val;
    }
  }
  return result;
}

function normalizeSiteBase(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.search = '';
    url.hash = '';
    if (!url.pathname.endsWith('/')) {
      url.pathname = `${url.pathname}/`;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function resolveOriginFromRequest(req: IncomingMessage): string | null {
  const forwarded = parseForwardedHeader(firstHeaderValue(req.headers['forwarded']));

  const rawHost =
    firstHeaderValue(req.headers['x-forwarded-host']) ||
    forwarded.host ||
    firstHeaderValue(req.headers['host']);

  // Allow only valid hostname / IPv6 literal with optional port
  if (!rawHost || !/^[A-Za-z0-9.\-:\[\]]+$/.test(rawHost)) {
    return null;
  }

  let proto = firstHeaderValue(req.headers['x-forwarded-proto']).toLowerCase();
  if (proto !== 'http' && proto !== 'https') {
    proto = forwarded.proto ?? '';
  }
  if (proto !== 'http' && proto !== 'https') {
    const cfVisitor = firstHeaderValue(req.headers['cf-visitor']);
    if (cfVisitor) {
      try {
        const parsed = JSON.parse(cfVisitor) as { scheme?: string };
        if (parsed.scheme === 'http' || parsed.scheme === 'https') {
          proto = parsed.scheme;
        }
      } catch {
        // ignore malformed header
      }
    }
  }
  if (proto !== 'http' && proto !== 'https') {
    const encrypted = Boolean((req.socket as { encrypted?: boolean } | undefined)?.encrypted);
    proto = encrypted ? 'https' : 'http';
  }

  return normalizeSiteBase(`${proto}://${rawHost}/`);
}

function escapeHtmlAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function replaceMetaContent(
  html: string,
  attrName: 'property' | 'name',
  attrValue: string,
  newContent: string
): string {
  const escapedContent = escapeHtmlAttr(newContent);
  const tagRegex = new RegExp(
    `<meta\\b[^>]*\\b${attrName}\\s*=\\s*["']${attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*>`,
    'gi'
  );
  return html.replace(tagRegex, (tag) => {
    if (/\bcontent\s*=\s*["'][^"']*["']/i.test(tag)) {
      return tag.replace(/\bcontent\s*=\s*["'][^"']*["']/i, `content="${escapedContent}"`);
    }
    return tag.replace(/\/?>$/, ` content="${escapedContent}" />`);
  });
}

function rewriteOgpMetaUrls(html: string, siteBaseUrl: string): string {
  const pageUrl = siteBaseUrl;
  const imageUrl = new URL(OGP_IMAGE_FILE, siteBaseUrl).toString();
  let out = html;
  out = replaceMetaContent(out, 'property', 'og:url', pageUrl);
  out = replaceMetaContent(out, 'property', 'og:image', imageUrl);
  out = replaceMetaContent(out, 'name', 'twitter:image', imageUrl);
  return out;
}

function isHtmlEntryRequest(req: IncomingMessage): boolean {
  const method = req.method?.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const rawUrl = req.url ?? '/';
  const pathname = rawUrl.split('?')[0] ?? '/';
  return pathname === '/' || pathname === '/index.html';
}

function ogpAbsoluteUrlPlugin(staticSiteBase: string | null): Plugin {
  let rootDir = process.cwd();
  let outDir = 'dist';

  return {
    name: 'manmarubuu-ogp-absolute-url',

    configResolved(config) {
      rootDir = config.root;
      outDir = config.build.outDir;
    },

    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!staticSiteBase) return html;
        return rewriteOgpMetaUrls(html, staticSiteBase);
      },
    },

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!isHtmlEntryRequest(req)) {
          next();
          return;
        }
        try {
          const indexPath = path.resolve(rootDir, 'index.html');
          const rawHtml = await fs.promises.readFile(indexPath, 'utf-8');
          const transformed = await server.transformIndexHtml(req.url ?? '/', rawHtml);
          const origin = resolveOriginFromRequest(req) ?? staticSiteBase;
          const body = origin ? rewriteOgpMetaUrls(transformed, origin) : transformed;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Length', String(Buffer.byteLength(body, 'utf-8')));
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Vary', 'Host, X-Forwarded-Host, X-Forwarded-Proto');
          if (req.method?.toUpperCase() === 'HEAD') {
            res.end();
          } else {
            res.end(body);
          }
        } catch (err) {
          next(err);
        }
      });
    },

    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!isHtmlEntryRequest(req)) {
          next();
          return;
        }
        try {
          const distIndexPath = path.resolve(rootDir, outDir, 'index.html');
          if (!fs.existsSync(distIndexPath)) {
            next();
            return;
          }
          const rawHtml = await fs.promises.readFile(distIndexPath, 'utf-8');
          const origin = resolveOriginFromRequest(req) ?? staticSiteBase;
          const body = origin ? rewriteOgpMetaUrls(rawHtml, origin) : rawHtml;

          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Length', String(Buffer.byteLength(body, 'utf-8')));
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Vary', 'Host, X-Forwarded-Host, X-Forwarded-Proto');
          if (req.method?.toUpperCase() === 'HEAD') {
            res.end();
          } else {
            res.end(body);
          }
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const staticSiteBase = normalizeSiteBase(env.VITE_SITE_URL || process.env.VITE_SITE_URL);

  return {
    base: './',
    plugins: [ogpAbsoluteUrlPlugin(staticSiteBase)],
    optimizeDeps: {
      exclude: ['@dimforge/rapier3d-compat'],
    },
    server: {
      port: 5173,
      strictPort: false,
      allowedHosts: true,
    },
    preview: {
      port: 5173,
      strictPort: false,
      allowedHosts: true,
    },
    build: {
      target: 'es2022',
      sourcemap: false,
    },
  };
});
