export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { APP_VERSION } from '../../updates/version';

/**
 * Без проверки прав — версия не секрет, а инструменту обновления (update.sh)
 * на сервере неоткуда взять сессию браузера, чтобы спросить её иначе (Р-31).
 */
export async function GET() {
  return NextResponse.json({ version: APP_VERSION });
}
