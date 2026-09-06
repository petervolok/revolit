import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@revolit/core/auth/config';

/**
 * Быстрая отсечка: без cookie сессии внутрь программы не пускаем.
 * Подлинность сессии проверяется на сервере в макете оболочки —
 * middleware работает на границе и не имеет доступа к базе.
 */
export function middleware(req: NextRequest) {
  const hasCookie = Boolean(req.cookies.get(SESSION_COOKIE)?.value);

  if (!hasCookie) {
    const url = new URL('/login', req.url);
    const target = req.nextUrl.pathname + req.nextUrl.search;
    if (target !== '/home') url.searchParams.set('next', target);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/home/:path*', '/settings/:path*', '/profile/:path*'],
};
