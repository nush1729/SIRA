import { prisma } from "../lib/prisma";

/**
 * Fair Workload-Aware Interviewer Matching (architecture doc Section 3, #3). Pure scoring
 * function over data already in Postgres — no LLM in this decision path, per that section's
 * "Constraint discipline" column.
 */
export const MatchingService = {
  async suggestInterviewers(params: {
    organizationId: string;
    requiredSkillNames: string[];
    roundType: string;
    excludeInterviewerIds?: string[];
  }) {
    const interviewers = await prisma.interviewerProfile.findMany({
      where: {
        user: { organizationId: params.organizationId },
        userId: { notIn: params.excludeInterviewerIds ?? [] },
      },
      include: {
        user: true,
        skills: { include: { skill: true } },
        panelAssignments: { include: { round: true } },
      },
    });

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const scored = interviewers.map((interviewer) => {
      const skillNames = interviewer.skills.map((s) => s.skill.name);
      const skillMatches = params.requiredSkillNames.filter((name) => skillNames.includes(name)).length;
      const skillScore = params.requiredSkillNames.length > 0 ? (skillMatches / params.requiredSkillNames.length) * 60 : 30;

      const recentLoad = interviewer.panelAssignments.filter((a) => a.round && a.round.dateRangeStart >= sevenDaysAgo).length;
      const workloadScore = 40 / (1 + recentLoad); // fewer recent interviews → higher score

      return {
        interviewerId: interviewer.userId,
        name: interviewer.user.fullName,
        skills: skillNames,
        recentInterviewCount: recentLoad,
        score: Math.round(skillScore + workloadScore),
      };
    });

    return scored.sort((a, b) => b.score - a.score);
  },
};
