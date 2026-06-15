import path from 'node:path';
import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Apply aggressive anti-cache headers so the dev server never serves a stale
 * copy of a generated asset while you iterate on its configuration.
 */
export function setNoStore(res: ServerResponse): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

/**
 * Combine Vite's `base` with a filename into a clean, absolute dev-server route.
 *
 * Vite normalizes `base` to start and end with `/`, but we join defensively so
 * a custom base (`/app/`) or a missing trailing slash never produces a broken
 * route like `/approbots.txt`.
 */
export function publicRoute(base: string, filename: string): string {
  return path.posix.join('/', base, filename);
}

/** Compute a weak ETag from content. */
export function weakEtag(content: string): string {
  return `W/"${crypto.createHash('sha1').update(content).digest('hex')}"`;
}

export interface SendAssetOptions {
  content: string;
  contentType: string;
  /** Send no-store headers. Default `true`. */
  noStore?: boolean;
  /** Send a weak ETag and honor `If-None-Match` with a 304. Default `true`. */
  etag?: boolean;
}

/**
 * Serve a generated string asset from the dev server with consistent caching
 * semantics: optional no-store headers and optional weak-ETag/304 handling.
 */
export function sendAsset(
  req: IncomingMessage,
  res: ServerResponse,
  { content, contentType, noStore = true, etag = true }: SendAssetOptions,
): void {
  res.setHeader('Content-Type', contentType);
  if (noStore) setNoStore(res);

  if (etag) {
    const tag = weakEtag(content);
    res.setHeader('ETag', tag);
    res.setHeader('Vary', 'If-None-Match');
    if (req.headers['if-none-match'] === tag) {
      res.statusCode = 304;
      res.end();
      return;
    }
  }

  res.end(content);
}
