const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Permissions-Policy': 'payment=(), usb=(), geolocation=(self), microphone=(self), camera=(self)',
  'Content-Security-Policy-Report-Only': "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: https: blob:; media-src 'self' data: https: blob:; connect-src 'self' https: wss:; worker-src 'self' blob:",
};

export function withSecurityHeaders(response, requestUrl) {
  // WebSocket upgrade responses cannot be reconstructed by the Fetch API.
  if (response.status === 101) return response;
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (name !== 'Strict-Transport-Security' || new URL(requestUrl).protocol === 'https:') {
      secured.headers.set(name, value);
    }
  }
  return secured;
}
