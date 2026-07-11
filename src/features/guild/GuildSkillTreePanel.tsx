import { canManageMembers, guildLevel, type GuildRole } from '@shared/progression/guild';
import {
  BASE_STATS,
  ADV_STATS,
  GUILD_STAT_META,
  rankOf,
  maxRank,
  stepOf,
  canSpend,
  raidPointsAvailable,
  levelPointsAvailable,
  type GuildStat,
  type GuildAlloc,
} from '@shared/progression/guildSkills';
import { UiIcon } from '@/components/synty/GameIcons';
import type { useGuildActions } from './useGuild';
import type { Guild } from './useGuild';

/**
 * Arbre de compétences de guilde. Deux monnaies :
 * - Points de raid → stats de base (atk/hp/def/xp/gold), +5% × 3 paliers.
 * - Points de niveau → stats avancées (crit), +1% par point (max 10).
 * Seuls fondateur & officiers peuvent dépenser (bouton grisé sinon).
 */
export function GuildSkillTreePanel({
  guild,
  role,
  actions,
}: {
  guild: Guild;
  role: GuildRole;
  actions: ReturnType<typeof useGuildActions>;
}) {
  const alloc = (guild.skill_alloc ?? {}) as GuildAlloc;
  const highest = guild.highest_raid_cleared ?? 0;
  const level = guildLevel(guild.xp ?? 0);
  const raidPts = raidPointsAvailable(highest, alloc);
  const lvlPts = levelPointsAvailable(level, alloc);
  const canEdit = canManageMembers(role);

  return (
    <div className="panel p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-[var(--color-ink)]">Arbre de guilde</h3>
        <div className="flex items-center gap-2 text-[11px]">
          <PointsChip label="Points de raid" value={raidPts} color="var(--color-gold)" />
          <PointsChip label="Points de niveau" value={lvlPts} color="var(--color-arcane)" />
        </div>
      </div>

      {!canEdit && (
        <p className="mb-2 text-[11px] italic text-[var(--color-muted)]">
          Seuls le fondateur et les officiers peuvent dépenser les points.
        </p>
      )}

      <Section title="Stats de base" subtitle="Points de raid — +5% par palier (×3)">
        {BASE_STATS.map((stat) => (
          <SkillRow
            key={stat}
            stat={stat}
            alloc={alloc}
            enabled={canEdit && canSpend(stat, alloc, highest, level) && !actions.isPending}
            onSpend={() => actions.mutate({ action: 'spend_skill', stat })}
          />
        ))}
      </Section>

      <Section title="Stats avancées" subtitle="Points de niveau — +1% par point (max 10)">
        {ADV_STATS.map((stat) => (
          <SkillRow
            key={stat}
            stat={stat}
            alloc={alloc}
            enabled={canEdit && canSpend(stat, alloc, highest, level) && !actions.isPending}
            onSpend={() => actions.mutate({ action: 'spend_skill', stat })}
          />
        ))}
      </Section>

      <p className="mt-2 text-[10px] text-[var(--color-muted)]/70">
        Ces bonus s'appliquent aux héros de tous les membres dans tous les combats — sauf l'arène.
      </p>
    </div>
  );
}

function PointsChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold"
      style={{ background: `${color}1f`, color }}
      title={label}
    >
      {label} : {value}
    </span>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-1">
        <span className="text-xs font-semibold text-[var(--color-ink)]">{title}</span>{' '}
        <span className="text-[10px] text-[var(--color-muted)]">· {subtitle}</span>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SkillRow({
  stat,
  alloc,
  enabled,
  onSpend,
}: {
  stat: GuildStat;
  alloc: GuildAlloc;
  enabled: boolean;
  onSpend: () => void;
}) {
  const meta = GUILD_STAT_META[stat];
  const rank = rankOf(alloc, stat);
  const max = maxRank(stat);
  const bonusPct = Math.round(rank * stepOf(stat) * 100);
  const maxed = rank >= max;

  return (
    <div className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-ink)]">{meta.label}</div>
        <div className="text-[10px] text-[var(--color-muted)]">
          {rank}/{max} · <span className="font-semibold text-[var(--color-gold-soft)]">+{bonusPct}%</span>
        </div>
      </div>
      {/* Jauge de paliers */}
      <div className="flex shrink-0 items-center gap-0.5">
        {Array.from({ length: max }).map((_, i) => (
          <span
            key={i}
            className="h-2 w-2 rounded-full"
            style={{ background: i < rank ? 'var(--color-gold)' : 'var(--color-edge-strong)' }}
          />
        ))}
      </div>
      <button
        onClick={onSpend}
        disabled={!enabled}
        className="btn btn-primary shrink-0 px-2.5 py-1 text-xs disabled:opacity-40"
        title={maxed ? 'Palier maximum' : 'Améliorer (1 point)'}
      >
        {maxed ? <UiIcon name="boss" size={12} /> : '+'}
      </button>
    </div>
  );
}
