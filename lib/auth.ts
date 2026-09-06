import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { SessionDTO, Role } from './contracts';

const secretKey = process.env.JWT_SECRET || 'fallback-secret-do-not-use-in-prod';
const key = new TextEncoder().encode(secretKey);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(sessionData: SessionDTO): Promise<void> {
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const token = await new SignJWT({ ...sessionData })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);

  const cookieStore = await cookies();
  cookieStore.set('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires,
  });
}

export async function getSession(): Promise<SessionDTO | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, key);
    return payload as unknown as SessionDTO;
  } catch (error) {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('token');
}

export class AuthError extends Error {
  constructor(public code: 'UNAUTHORIZED' | 'FORBIDDEN', message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export async function requireRole(...allowedRoles: Role[]): Promise<SessionDTO> {
  const session = await getSession();
  if (!session) {
    throw new AuthError('UNAUTHORIZED', 'You must be logged in.');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
    throw new AuthError('FORBIDDEN', 'You do not have permission for this action.');
  }

  return session;
}
