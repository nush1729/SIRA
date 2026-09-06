import { prisma } from "../lib/prisma";
import { AuditService } from "./audit.service";

export const InterviewService = {
  async createRequest(params: {
    organizationId: string;
    jobId: string;
    candidateId: string;
    actorId: string;
    initialRound: {
      roundType: "SCREENING" | "TECHNICAL" | "MANAGERIAL" | "HR";
      durationMinutes: number;
      dateRangeStart: Date;
      dateRangeEnd: Date;
      interviewerIds: string[];
    };
  }) {
    const request = await prisma.interviewRequest.create({
      data: {
        jobId: params.jobId,
        candidateId: params.candidateId,
        rounds: {
          create: {
            roundType: params.initialRound.roundType,
            durationMinutes: params.initialRound.durationMinutes,
            dateRangeStart: params.initialRound.dateRangeStart,
            dateRangeEnd: params.initialRound.dateRangeEnd,
            sequenceOrder: 1,
            panelAssignments: {
              create: params.initialRound.interviewerIds.map((id) => ({ interviewerId: id, isRequired: true })),
            },
          },
        },
      },
      include: { rounds: true },
    });

    await AuditService.record({
      entityType: "InterviewRequest",
      entityId: request.id,
      action: "request_created",
      actorId: params.actorId,
      afterState: request,
    });

    return request;
  },

  async getById(id: string) {
    return prisma.interviewRequest.findUnique({
      where: { id },
      include: {
        candidate: { include: { user: true } },
        job: true,
        rounds: {
          include: {
            panelAssignments: { include: { interviewer: { include: { user: true } } } },
            slotRecommendations: { include: { booking: { include: { calendarEvent: true } } } },
          },
        },
      },
    });
  },

  async list(organizationId: string, filters: { status?: string }) {
    return prisma.interviewRequest.findMany({
      where: {
        job: { organizationId },
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      include: { candidate: { include: { user: true } }, job: true, rounds: true },
      orderBy: { createdAt: "desc" },
    });
  },
};
