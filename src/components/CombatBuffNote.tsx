import { useMyGuild } from '@/features/guild/useGuild';
import { useTitlesStatus } from '@/features/achievements/useAchievements';
import { combatBuff, isNeutralBuff } from '@shared/progression/guildSkills';
import { titleAtkBonus } from '@shared/progression/eventTitles';
import { STAT_TITLE_COLOR } from '@/lib/gameUi';
import { UiIcon } from '@/components/synty/GameIcons';

/**
 * BONUS APPLIQUÉS EN COMBAT, mais absents des stats de la fiche.
 *
 * La fiche d'un héros montre ses stats PROPRES (classe + niveau + points +
 * équipement + sets). Or le moteur ajoute encore, au moment du combat, l'arbre de
 * GUILDE et le TITRE de gloire équipé. Un joueur d'une guilde à +15 % PV voyait
 * donc systématiquement moins de PV sur la fiche que dans le jeu, sans que rien
 * ne l'explique — d'où l'impression d'un bug de calcul.
 *
 * On ne gonfle pas les chiffres de la fiche : ils resteraient faux dès que le
 * joueur change de guilde ou perd son titre, et l'arène (qui ignore ces buffs)
 * n'aurait plus les mêmes. On AFFICHE l'écart, ce qui est à la fois exact et
 * pédagogique.
 */
export function CombatBuffNote({ className = '' }: { className?: string }) {
  const { data: guild } = useMyGuild();
  const { data: titles } = useTitlesStatus();

  const buff = combatBuff(guild?.guild?.skill_alloc ?? {});
  const equipped = (titles?.event_titles ?? []).find((e) => e.title === titles?.title);
  const titleAtk = titleAtkBonus(equipped?.stat_mult);

  if (isNeutralBuff(buff) && titleAtk <= 0) return null;

  const pct = (v: number) => `+${Math.round(v * 100)} %`;
  const parts: string[] = [];
  if (buff.hp > 0) parts.push(`${pct(buff.hp)} PV`);
  // Le titre s'ajoute à l'ATK de guilde : on annonce le total réellement appliqué.
  const atk = buff.atk + titleAtk;
  if (atk > 0) parts.push(`${pct(atk)} ATK`);
  if (buff.def > 0) parts.push(`${pct(buff.def)} DEF`);
  if (buff.critChance > 0) parts.push(`${pct(buff.critChance)} crit`);
  if (buff.critDmg > 0) parts.push(`${pct(buff.critDmg)} dégâts crit`);

  const sources = [
    guild?.guild?.name ? `guilde ${guild.guild.name}` : null,
    titleAtk > 0 && equipped ? `titre « ${equipped.title} »` : null,
  ].filter(Boolean) as string[];

  return (
    <div
      className={`rounded-lg border p-2.5 text-[11px] ${className}`}
      style={{ borderColor: `${STAT_TITLE_COLOR}55`, background: `${STAT_TITLE_COLOR}0f` }}
      title="Ces bonus s'ajoutent au moment du combat : ils ne sont pas compris dans les stats ci-dessus."
    >
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <UiIcon name="power" size={12} color={STAT_TITLE_COLOR} />
        <strong style={{ color: STAT_TITLE_COLOR }}>En combat :</strong>
        <span className="font-semibold text-[var(--color-ink)]">{parts.join(' · ')}</span>
        <span className="text-[var(--color-muted)]">
          — en plus des stats ci-dessus ({sources.join(', ')}).
        </span>
      </span>
    </div>
  );
}
