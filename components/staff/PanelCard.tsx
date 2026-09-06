"use client";

/**
 * Role C — one panel member (docs/09 §5): name, labels/skills, load, status,
 * and the `reason` the engine gave for picking them.
 */

import { StatusPill, cx } from "@/components/staff/kit";
import { ROUND_LABEL, avatarTone, initials } from "@/components/staff/format";
import type { PanelMemberDTO } from "@/lib/contracts";

export function PanelCard({ member }: { member: PanelMemberDTO }) {
  return (
    <li className="flex gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200/80 transition hover:ring-zinc-300">
      <span
        className={cx(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold ring-1",
          avatarTone(member.name)
        )}
      >
        {initials(member.name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold text-zinc-900">{member.name}</p>
          <StatusPill status={member.status} />
        </div>

        <p className="mt-1 text-[13px] text-zinc-600">
          {member.labels.map((l) => ROUND_LABEL[l] ?? l).join(", ")}
          {member.skills.length > 0 && <> · {member.skills.join(", ")}</>}
        </p>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-600">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" aria-hidden />
            load {member.load}
          </span>
        </div>

        {member.reason && (
          <p className="mt-2.5 rounded-md border-l-2 border-indigo-300 bg-indigo-50/50 py-1.5 pl-2.5 pr-2 text-[13px] italic text-zinc-600">
            {member.reason}
          </p>
        )}
      </div>
    </li>
  );
}
