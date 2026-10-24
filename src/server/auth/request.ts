// Next route handlers may provide a proxied Request. Undici's Request(existing)
// brand-checks private fields on that proxy; copying its public fields avoids it.
export function sanitizeAuthRequest(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete('x-perplex-guest-validated');
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method, headers, signal: request.signal,
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(request.url, init);
}
