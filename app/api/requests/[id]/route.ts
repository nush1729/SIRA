import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { ApiOk, ApiErr, RequestDetailDTO } from '@/lib/contracts';
import { fetchRequestDetail } from '@/lib/data-fetchers';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole("ADMIN");
    const { id } = await params;
    
    const detail = await fetchRequestDetail(id);
    if (!detail) {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: 'NOT_FOUND', message: 'Request not found' } }, { status: 404 });
    }

    return NextResponse.json<ApiOk<RequestDetailDTO>>({ ok: true, data: detail });
  } catch (err: any) {
    if (err.name === 'AuthError') {
      return NextResponse.json<ApiErr>({ ok: false, error: { code: err.code as any, message: err.message } }, { status: err.code === 'UNAUTHORIZED' ? 401 : 403 });
    }
    return NextResponse.json<ApiErr>({ ok: false, error: { code: 'VALIDATION_ERROR', message: 'Internal error' } }, { status: 500 });
  }
}
