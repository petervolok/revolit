import type { NextRequest } from 'next/server';

export function clientIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? undefined;
}

export function userAgent(req: NextRequest): string | undefined {
  return req.headers.get('user-agent')?.slice(0, 500) ?? undefined;
}
