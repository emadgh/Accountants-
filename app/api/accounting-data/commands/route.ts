import type { NextRequest } from 'next/server';
import { POST as handleAccountingCommand } from '../route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Authenticated command endpoint used by ordinary accounting writes. */
export async function POST(request: NextRequest) {
  return handleAccountingCommand(request);
}
