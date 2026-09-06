import { prisma } from "../lib/prisma";

/**
 * Append-only writes only — nothing in this codebase should ever call prisma.auditLog.update
 * or .delete. See architecture doc Section 6.2: AuditLog is immutable by design.
 */
export const AuditService = {
  async record(params: {
    roundId?: string;
    entityType: string;
    entityId: string;
    action: string;
    actorId: string; // a user id, or "assistant:<user_id>" for AI-assistant-initiated actions
    beforeState?: unknown;
    afterState?: unknown;
  }) {
    await prisma.auditLog.create({
      data: {
        roundId: params.roundId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        actorId: params.actorId,
        beforeState: params.beforeState as never,
        afterState: params.afterState as never,
      },
    });
  },

  async listForEntity(entityType: string, entityId: string) {
    return prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: "asc" },
    });
  },
};
