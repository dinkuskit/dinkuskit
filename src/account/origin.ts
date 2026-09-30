/** Custom browser mutations must reject foreign and missing Origin before any D1 change. */
export function rejectCrossOriginMutation(request: Request, expectedOrigin: string): Response | null {
  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedOrigin) {
    return new Response(JSON.stringify({ error: 'invalid_origin' }), {
      status: 403,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    });
  }
  return null;
}
