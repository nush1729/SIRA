import { NextResponse } from 'next/server';
import { createSession, verifyPassword } from '@/lib/auth';
import prisma from '@/lib/db';
import { ApiOk, ApiErr } from '@/lib/contracts';

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' } },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
        { status: 401 }
      );
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json<ApiErr>(
        { ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
        { status: 401 }
      );
    }

    const sessionData = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      timezone: user.timezone,
    };

    await createSession(sessionData);

    return NextResponse.json<ApiOk<typeof sessionData>>({ ok: true, data: sessionData });
  } catch (err) {
    return NextResponse.json<ApiErr>(
      { ok: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid request format' } },
      { status: 400 }
    );
  }
}
