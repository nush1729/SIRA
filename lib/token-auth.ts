import prisma from '@/lib/db';

export async function validateCandidateToken(token: string) {
  const request = await prisma.interviewRequest.findUnique({
    where: { token },
    include: {
      candidate: true,
      windows: true,
      panel: { include: { interviewer: true } },
      bookings: { where: { status: 'CONFIRMED' } }
    }
  });

  if (!request) {
    throw new Error('INVALID_TOKEN');
  }

  if (new Date() > request.tokenExpiresAt) {
    throw new Error('TOKEN_EXPIRED');
  }

  return request;
}
