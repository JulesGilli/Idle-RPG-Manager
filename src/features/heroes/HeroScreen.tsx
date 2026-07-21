import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHeroes, useRenameHero, HERO_NAME_MAX, type HeroView } from './useHeroes';
import { useHeroDeployments } from './useHeroDeployment';
import { DeployBadge } from '@/components/HeroCard';
import { useItems, useEquip, type ItemRow } from './useItems';
import { classMeta, rarityColor } from '@/lib/gameUi';
import { ZoneUpgradeStars } from '@/components/ItemStars';
import { RarityBadge } from '@/components/RarityBadge';
import { materialZone } from '@/lib/itemZone';
import { GRADE_META } from '@shared/progression/recruit';
import { computeAbilities, computePassives, skillTreeFor } from '@shared/progression/skills';
import { itemCombatPassive } from '@shared/progression/heroLoan';
import { CRIT_CHANCE_CAP } from '@shared/combat/resolveCombat';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { SETS, describeSetEffect, setEffectAt } from '@shared/progression/sets';
import { useRunes, useRuneActions } from '@/features/runes/useRunes';
import { canEquipWeight, type ItemWeight } from '@shared/progression/loot';
import type { Ability, PassiveType, StatusType } from '@shared/combat';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, EquipmentIcon, PassiveIcon, SkillNodeIcon } from '@/components/synty/GameIcons';
import { classWeaponCleanUrl, syntyUrl, STAT_GLYPH } from '@/lib/synty';

type Slot = 'weapon' | 'armor' | 'jewel' | 'relic';

const pct = (x: number) => `${Math.round(x * 100)}%`;

const STATUS_LABEL: Record<StatusType, string> = {
  poison: 'poison',
  burn: 'feu',
  stun: 'étourdissement',
  weaken: 'affaiblissement',
  taunt: 'provocation',
};

const SLOT_META: { slot: Slot; label: string; iconSrc: string }[] = [
  { slot: 'weapon', label: 'Arme', iconSrc: syntyUrl.weapon('ICON_SM_Wep_Sword_01') },
  { slot: 'armor', label: 'Armure', iconSrc: syntyUrl.weapon('ICON_SM_Wep_Shield_01') },
  { slot: 'jewel', label: 'Bijou', iconSrc: syntyUrl.resource('ICON_SM_Item_Ring_01') },
  { slot: 'relic', label: 'Relique', iconSrc: syntyUrl.fw('Gem06') },
];

/* ------------------------------------------------------------------ page -- */

export function HeroScreen() {
  const { heroId } = useParams<{ heroId: string }>();
  const navigate = useNavigate();
  const { data: heroes, isLoading } = useHeroes();
  const hero = heroes?.find((h) => h.id === heroId);

  if (isLoading) return <p className="text-[var(--color-muted)]">Invocation du héros…</p>;
  if (!hero) {
    return (
      <section className="anim-fade space-y-4">
        <BackLink />
        <p className="text-[var(--color-muted)]">Ce héros est introuvable.</p>
      </section>
    );
  }

  return (
    <section className="anim-fade space-y-5">
      <BackLink />
      <HeroHeader hero={hero} onBack={() => navigate('/inventory')} />
      <div className="grid gap-5 lg:grid-cols-2">
        <StatsPanel hero={hero} />
        <EquipmentPanel hero={hero} allHeroes={heroes ?? []} />
      </div>
    </section>
  );
}

function BackLink() {
  return (
    <Link
      to="/inventory"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
    >
      <span aria-hidden>←</span> Retour à l'inventaire
    </Link>
  );
}

/* ---------------------------------------------------------------- header -- */

function HeroHeader({ hero, onBack }: { hero: HeroView; onBack: () => void }) {
  const meta = classMeta(hero.classId);
  const grade = GRADE_META[hero.grade];
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));
  const deployment = useHeroDeployments().get(hero.id);

  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.accent }} />
      <div className="flex flex-wrap items-start gap-4">
        {/* Portrait */}
        <div
          className="relative h-16 w-16 shrink-0 rounded-full"
          style={{ backgroundColor: `${meta.accent}22` }}
          title={hero.className}
        >
          <SyntyGlyph
            src={classWeaponCleanUrl(hero.classId)}
            color={meta.accent}
            size={38}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          />
          <img
            src={syntyUrl.fw('Ring_Large01')}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full select-none"
          />
        </div>

        <div className="min-w-0 flex-1">
          <NameEditor hero={hero} />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
              {hero.className} · Niv. {hero.level}
            </span>
            <span
              className="rounded-full px-1.5 text-[11px] font-bold"
              style={{ color: grade.color, boxShadow: `inset 0 0 0 1px ${grade.color}66` }}
              title="Grade de naissance"
            >
              {hero.grade}
            </span>
            {deployment && <DeployBadge deployment={deployment} />}
          </div>
        </div>

        <button
          onClick={onBack}
          className="hidden shrink-0 text-right sm:block"
          title="Puissance de combat"
        >
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Puissance
          </div>
          <div className="font-display text-2xl font-bold text-[var(--color-gold)]">
            {hero.power}
          </div>
        </button>
      </div>

      {/* XP */}
      <div className="mt-4">
        <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
          <span>XP</span>
          <span>
            {hero.xp} / {hero.xpToNext}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-arcane)] to-[#a78bfa]"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>

      {hero.skillPoints > 0 && (
        <Link
          to={`/library?hero=${hero.id}`}
          className="mt-4 flex items-center justify-center gap-1 rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-3 py-1.5 text-center text-xs font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-arcane)]/20"
        >
          <UiIcon name="book" size={14} color="var(--color-arcane)" />
          {hero.skillPoints} point(s) de compétence à dépenser
        </Link>
      )}
    </div>
  );
}

function NameEditor({ hero }: { hero: HeroView }) {
  const rename = useRenameHero();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hero.name);

  const trimmed = value.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= HERO_NAME_MAX;

  function start() {
    setValue(hero.name);
    setEditing(true);
  }
  function save() {
    if (!valid || trimmed === hero.name) {
      setEditing(false);
      return;
    }
    rename.mutate(
      { heroId: hero.id, name: trimmed },
      { onSuccess: () => setEditing(false) },
    );
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <h2 className="heading truncate text-2xl">{hero.name}</h2>
        <button
          onClick={start}
          title="Renommer"
          className="shrink-0 text-base text-[var(--color-muted)]/60 transition hover:text-[var(--color-ink)]"
        >
          <span aria-hidden>✎</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={value}
          maxLength={HERO_NAME_MAX}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="min-w-0 flex-1 rounded-lg border border-[var(--color-edge)] bg-[var(--color-panel-2)] px-3 py-1.5 text-lg font-semibold text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]"
        />
        <button
          onClick={save}
          disabled={!valid || rename.isPending}
          className="btn btn-primary shrink-0 px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {rename.isPending ? '…' : 'OK'}
        </button>
        <button
          onClick={() => setEditing(false)}
          className="shrink-0 px-2 py-1.5 text-xs text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
        >
          Annuler
        </button>
      </div>
      {rename.isError && (
        <p className="text-[11px] text-[var(--color-ember)]">
          {rename.error instanceof Error ? rename.error.message : 'Échec du renommage'}
        </p>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- stats -- */

/**
 * Compétences réellement APPRISES, branche par branche, avec leur rang. La fiche
 * n'affichait jusqu'ici que les effets agrégés : impossible de savoir quels nœuds
 * étaient pris, ni où étaient partis les points.
 */
function LearnedSkills({ hero }: { hero: HeroView }) {
  const branches = useMemo(() => {
    return skillTreeFor(hero.classId)
      .map((b) => ({
        name: b.name,
        color: b.color,
        nodes: b.nodes
          .map((n) => ({ node: n, rank: hero.skills[n.id] ?? 0 }))
          .filter((x) => x.rank > 0),
      }))
      .filter((b) => b.nodes.length > 0);
  }, [hero.classId, hero.skills]);

  const spent = branches.reduce((s, b) => s + b.nodes.reduce((t, n) => t + n.rank, 0), 0);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
          Compétences {spent > 0 ? `· ${spent} point(s)` : ''}
        </span>
        {/* Accès à l'arbre TOUJOURS visible : il n'apparaissait qu'en cas de points
            non dépensés, alors qu'on veut aussi pouvoir aller relire ou réinitialiser. */}
        <Link
          to={`/library?hero=${hero.id}`}
          className="inline-flex items-center gap-1 rounded-md border border-[var(--color-edge)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-muted)] transition hover:border-[var(--color-arcane)] hover:text-[var(--color-ink)]"
          title="Ouvrir l'arbre de compétences de ce héros"
        >
          <UiIcon name="book" size={11} color="currentColor" /> Arbre
        </Link>
      </div>

      {branches.length === 0 ? (
        <p className="text-[11px] text-[var(--color-muted)]/80">
          Aucune compétence apprise pour l'instant.
        </p>
      ) : (
        <div className="space-y-2">
          {branches.map((b) => (
            <div key={b.name}>
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: b.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: b.color }} />
                {b.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {b.nodes.map(({ node, rank }) => {
                  const equipped = node.id === hero.activeSkillId || node.id === hero.ultimateSkillId;
                  return (
                    <span
                      key={node.id}
                      title={`${node.name} — rang ${rank}/${node.maxRank}${equipped ? ' · équipé' : ''}\n${node.desc}`}
                      className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] text-[var(--color-ink)]"
                      style={{
                        borderColor: equipped ? b.color : 'var(--color-edge)',
                        background: equipped ? `${b.color}1a` : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      <SkillNodeIcon nodeId={node.id} size={12} color={b.color} />
                      {node.name}
                      <span className="tabular-nums text-[var(--color-muted)]">
                        {rank}/{node.maxRank}
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatsPanel({ hero }: { hero: HeroView }) {
  // Passifs de combat effectifs = gemme du bijou + passif de l'ARME (stat
  // secondaire : Arc → crit, Dague → esquive) + passifs de l'arbre (même
  // agrégation qu'en combat, cf. buildHeroSnapshot).
  const passives = useMemo(() => {
    const map = new Map<PassiveType, number>();
    const add = (t: PassiveType, v: number) => map.set(t, (map.get(t) ?? 0) + v);
    for (const it of [hero.jewel, hero.weapon]) {
      const p = itemCombatPassive(it);
      if (p) add(p.type, p.value);
    }
    const loadout = { activeId: hero.activeSkillId, ultimateId: hero.ultimateSkillId };
    for (const p of computePassives(hero.classId, hero.skills, loadout)) add(p.type, p.value);
    return map;
  }, [hero]);

  const abilities = useMemo(
    () => computeAbilities(hero.classId, hero.skills, {
      activeId: hero.activeSkillId,
      ultimateId: hero.ultimateSkillId,
    }),
    [hero.classId, hero.skills, hero.activeSkillId, hero.ultimateSkillId],
  );

  // Plafonné comme en combat : afficher 90 % quand le moteur en applique 75
  // serait un mensonge (cf. CRIT_CHANCE_CAP).
  const crit = Math.min(CRIT_CHANCE_CAP, passives.get('crit') ?? 0);
  const others = [...passives].filter(([t]) => t !== 'crit' && (passives.get(t) ?? 0) > 0);

  return (
    <div className="panel space-y-4 p-4">
      <h3 className="font-display font-semibold text-[var(--color-ink)]">Statistiques</h3>

      {/* Stats de base */}
      <div className="grid grid-cols-4 gap-1.5">
        <BaseStat label="PV" value={hero.stats.hp} glyph={STAT_GLYPH.hp} color="#fb7185" />
        <BaseStat label="ATK" value={hero.stats.atk} glyph={STAT_GLYPH.atk} color="#f5b544" />
        <BaseStat label="DEF" value={hero.stats.def} glyph={STAT_GLYPH.def} color="#56b6f4" />
        <BaseStat label="VIT" value={hero.stats.speed} glyph={STAT_GLYPH.speed} color="#5fd39b" />
      </div>

      {/* Critique (toujours affiché) */}
      <div className="grid grid-cols-2 gap-1.5">
        <DerivedStat icon="⚡" label="Chance critique" value={pct(crit)} />
        <DerivedStat icon="💥" label="Dégâts critiques" value="×2" />
      </div>

      {/* Autres passifs présents */}
      {others.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            Passifs de combat
          </div>
          <div className="flex flex-wrap gap-1.5">
            {others.map(([type, value]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-edge)] bg-white/[0.03] px-2 py-1 text-xs font-semibold text-[var(--color-ink)]"
                title={`${PASSIVE_META[type].label} — ${PASSIVE_META[type].desc} Cumule toutes tes sources (compétences, équipement, rune, sets).`}
              >
                <PassiveIcon passive={type} size={13} />
                {PASSIVE_META[type].label}
                <span className="text-[var(--color-arcane)]">{pct(value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Compétences PRISES dans l'arbre. La section « Capacités » juste en dessous
          liste les EFFETS ; ici on nomme les nœuds et leur rang, seule vue qui dit
          où sont réellement partis les points. */}
      <LearnedSkills hero={hero} />

      {/* Capacités apprises (procs + ultime) */}
      <div>
        <div className="mb-1.5 text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
          Capacités
        </div>
        {abilities.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted)]/80">
            Aucune capacité apprise. Dépense des points à la Bibliothèque.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {abilities.map((a, i) => {
              const f = formatAbility(a);
              return (
                <li key={i} className="flex items-start gap-2 text-[11px]">
                  <span aria-hidden className="mt-[1px]">
                    {f.icon}
                  </span>
                  <span className="text-[var(--color-ink)]/85">
                    <span className="font-semibold text-[var(--color-ink)]">{f.label}</span> —{' '}
                    {f.detail}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hero.sets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {hero.sets.map((s) => {
            const need = setEffectAt(s.set);
            return (
              <span
                key={s.set.id}
                className={`chip text-[10px] ${
                  s.usable
                    ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
                    : 'bg-white/5 text-[var(--color-muted)] line-through'
                }`}
                title={
                  s.usable
                    ? s.set.theme
                    : `Inactif — réservé aux poids : ${s.set.weights.join(', ')}`
                }
              >
                {s.set.name} {Math.min(need, s.count)}/{need}
                {!s.usable && ' · inactif'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BaseStat({
  label,
  value,
  glyph,
  color,
}: {
  label: string;
  value: number;
  glyph: string;
  color: string;
}) {
  return (
    <div className="stat-chip">
      <div className="flex items-center gap-1">
        <SyntyGlyph src={glyph} color={color} size={12} title={label} />
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
    </div>
  );
}

function DerivedStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-edge)] bg-white/[0.03] px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
        <span aria-hidden>{icon}</span>
        {label}
      </span>
      <span className="text-sm font-semibold text-[var(--color-ink)]">{value}</span>
    </div>
  );
}

function formatAbility(a: Ability): { icon: string; label: string; detail: string } {
  switch (a.kind) {
    case 'armor_pen':
      return {
        icon: '🪓',
        label: "Pénétration d'armure",
        detail: `Ignore ${pct(a.value)} de la DEF ennemie.`,
      };
    case 'reckless':
      return {
        icon: '📯',
        label: 'Fureur aveugle',
        detail: `+${Math.round(a.atkBonus * 100)} % d'ATK, mais ${pct(a.friendlyFire)} de tes attaques de base touchent un allié au hasard.`,
      };
    case 'blood_pact':
      return {
        icon: '🩸',
        label: 'Pacte de sang',
        detail: `+${Math.round(a.ampPerMissing * 100)} % de dégâts par tranche de 100 % de PV perdus, et tu t'infliges ${pct(a.selfRatio)} des dégâts que tu portes. Ne peut pas te tuer.`,
      };
    case 'def_to_atk':
      return {
        icon: '⚔️',
        label: 'Armure sacrifiée',
        detail: `Convertit ${pct(a.ratio)} de ta DEF en ATK. Tu frappes plus fort, tu encaisses moins.`,
      };
    case 'stack_cap_mult':
      return {
        icon: '🧪',
        label: 'Marques plus profondes',
        detail: `Multiplie par ${a.mult} le nombre de marques empilables sur tes cibles. Sans effet si tu n'en poses aucune.`,
      };
    case 'on_hit':
      return {
        icon: '🎯',
        label: `À l'attaque : ${STATUS_LABEL[a.status]}`,
        detail: `${pct(a.chance)} d'appliquer ${STATUS_LABEL[a.status]} pendant ${a.duration} tour(s).`,
      };
    case 'multi_shot':
      return {
        icon: '🏹',
        label: 'Tir multiple',
        detail: `${pct(a.chance)} de frapper ${a.extraTargets} cible(s) en plus.`,
      };
    case 'extra_attack':
      return {
        icon: '💨',
        label: 'Attaque supplémentaire',
        detail: `${pct(a.chance)} de rejouer une attaque dans le même tour.`,
      };
    case 'amp_vs_status':
      return {
        icon: '💥',
        label: `Amplification (${STATUS_LABEL[a.status]})`,
        detail: `+${pct(a.bonus)} de dégâts contre les cibles ${STATUS_LABEL[a.status]}.`,
      };
    case 'dmg_type_amp': {
      const labels: Record<string, string> = {
        physical: 'physiques',
        magical: 'magiques',
        fire: 'de feu',
        poison: 'de poison',
        arcane: 'arcaniques',
      };
      const l = labels[a.damageType] ?? a.damageType;
      return { icon: '🔺', label: `Dégâts ${l}`, detail: `+${pct(a.value)} de dégâts ${l}.` };
    }
    case 'heal_convert':
      return {
        icon: '🩸',
        label: 'Soin offensif',
        detail: `Les soins émis rendent ${pct(1 - a.ratio)} aux alliés ; ${pct(a.ratio)} partent en dégâts sur un ennemi aléatoire.`,
      };
    case 'autocast': {
      const act = a.action;
      let detail: string;
      switch (act.type) {
        case 'aoe':
          detail = `Dégâts de zone (×${act.dmgMult})${act.status ? ` + ${STATUS_LABEL[act.status]}` : ''}.`;
          break;
        case 'stun_all':
          detail = `Étourdit tous les ennemis (${act.duration} tour(s)).`;
          break;
        case 'stun_lowest':
          detail = `Étourdit les ${act.count} cibles les plus faibles (${act.duration} tour(s))${
            act.dmgMult ? ` + ×${act.dmgMult} dégâts` : ''
          }.`;
          break;
        case 'nuke':
          detail = `Frappe brutale sur une cible (×${act.dmgMult})${act.status ? ` + ${STATUS_LABEL[act.status]}` : ''}.`;
          break;
        case 'pct_hp':
          detail = `Inflige ${pct(act.pct)} des PV max de la cible (plafonné à ×${act.capMult} ATK).`;
          break;
        case 'multi_hit':
          detail = `Frappe tous les ennemis ${act.hits}× (×${act.dmgMult} par coup).`;
          break;
        case 'detonate_all':
          detail = `Fait exploser les stacks de tous les ennemis (×${act.dmgMult} ATK).`;
          break;
        case 'heal_all':
          detail = `Soigne les alliés blessés de ${pct(act.pct)} de leurs PV max.`;
          break;
        case 'buff': {
          const parts = [
            act.atk ? `+${pct(act.atk)} ATK` : null,
            act.def ? `+${pct(act.def)} DEF` : null,
            act.speed ? `+${pct(act.speed)} VIT` : null,
            act.dmg ? `+${pct(act.dmg)} dégâts` : null,
            act.reduce ? `−${pct(act.reduce)} dégâts subis` : null,
            act.reflect ? `renvoi ${pct(act.reflect)}` : null,
            act.thornsMult ? `épines ×${1 + act.thornsMult}` : null,
          ].filter(Boolean).join(', ');
          detail = `${act.scope === 'team' ? "Toute l'équipe" : 'Toi'} : ${parts} pendant ${act.duration} tours.`;
          break;
        }
        case 'extra_turn':
          detail = "Toute l'équipe (même les alliés à terre) rejoue une attaque.";
          break;
        case 'execute_strike':
          detail = `Frappe (×${act.dmgMult}) ; exécute instantanément sous ${pct(act.instakillPct)} PV.`;
          break;
        case 'purge':
          detail = `Purge jusqu'à ${act.count} bienfait(s) de la cible${act.dmgMult ? ` + dégâts (×${act.dmgMult})` : ''}${act.perPurgedDmg ? ` +×${act.perPurgedDmg}/bienfait` : ''}.`;
          break;
        case 'extend_statuses':
          detail =
            `Prolonge toutes les afflictions des ennemis de ${act.turns} tours` +
            (act.dotAmp ? ` et intensifie leurs DoT de ${pct(act.dotAmp)} (une seule fois par affliction)` : '') +
            `, sans consommer les stacks d'embrasement.`;
          break;
        case 'summon_assault':
          detail = `Frappe (+${pct(act.dmgMult)} dégâts) puis chacune de tes invocations rejoue une attaque.`;
          break;
        case 'summon_hero':
          detail = `Invoque une seule fois un héros-squelette${act.withSpecials ? ' doté de sa capacité spéciale' : ''}.`;
          break;
        case 'creature_aoe':
          detail = `${act.creatureName} frappe tous les ennemis pour ${pct(act.dmgMult)} de son propre ATK.`;
          break;
        case 'sacrifice_transfer':
          detail =
            `Se sacrifie et transfère ${pct(act.pctPerStack)} de ses stats PAR ossement récolté à ${act.creatureName}` +
            (act.delayRounds ? `, ${act.delayRounds} tours après son invocation.` : '.');
          break;
        case 'resummon':
          detail = `Rejoue une fois l'invocation de masse du nécromancien.`;
          break;
      }
      return { icon: '🌟', label: `Capacité · tous les ${a.everyRounds} tours`, detail };
    }
    case 'revive':
      return {
        icon: '🕊️',
        label: 'Résurrection',
        detail: `Ressuscite une fois par combat à ${pct(a.hpPct)} PV.`,
      };
    case 'contagion':
      return {
        icon: '🦠',
        label: 'Contagion',
        detail: `${pct(a.chance)} que tes DoT se propagent à un autre ennemi.`,
      };
    case 'taunt':
      return {
        icon: '📣',
        label: `Provocation · tous les ${a.everyRounds} tours`,
        detail: `Force les ennemis à te cibler (${a.duration} tour(s)).`,
      };
    case 'stat_mod': {
      const statLabel = a.stat === 'atk' ? 'ATK' : a.stat === 'def' ? 'DEF' : 'PV max';
      const sign = a.value >= 0 ? '+' : '';
      return {
        icon: a.scope === 'team' ? '🎌' : '🔮',
        label: a.scope === 'team' ? `Aura d'équipe (${statLabel})` : `Buff personnel (${statLabel})`,
        detail: `${sign}${pct(a.value)} de ${statLabel} ${a.scope === 'team' ? "à toute l'équipe" : 'pour toi'}.`,
      };
    }
    case 'stack_on_hit': {
      const m = a.mark === 'burn' ? 'embrasement' : 'marque arcanique';
      return {
        icon: a.mark === 'burn' ? '🔥' : '🔯',
        label: `Stacks (${m})`,
        detail: `${pct(a.chance)} d'ajouter une stack de ${m} à l'attaque.`,
      };
    }
    case 'amp_per_stack': {
      const m = a.mark === 'burn' ? 'embrasement' : 'marque arcanique';
      return {
        icon: '💥',
        label: 'Amplification par stack',
        detail: `+${pct(a.bonus)} de dégâts par stack de ${m} sur la cible.`,
      };
    }
    case 'detonate':
      return {
        icon: '🌋',
        label: 'Détonation',
        detail: `À ${a.threshold} stacks : explosion (×${a.dmgMult} ATK) puis remise à zéro.`,
      };
    case 'immune':
      return {
        icon: '🗿',
        label: 'Immunité',
        detail: `${pct(a.chance)} d'ignorer ${a.statuses ? a.statuses.map((s) => STATUS_LABEL[s]).join(' / ') : 'un effet négatif'}.`,
      };
    case 'heal_aura':
      return {
        icon: '✋',
        label: 'Soin passif',
        detail: `Soigne l'allié le plus bas de ${pct(a.pct)} de ses PV max chaque tour.`,
      };
    case 'heal_amp':
      return { icon: '🌟', label: 'Soins amplifiés', detail: `+${pct(a.bonus)} sur tous tes soins.` };
    case 'ally_shield':
      return {
        icon: '✨',
        label: "Barrière d'allié",
        detail: `${pct(a.chance)}/tour de poser une barrière (${pct(a.pct)} PV) sur l'allié le plus faible.`,
      };
    case 'barrier':
      return {
        icon: '🛡️',
        label: 'Barrière',
        detail: `Regagne chaque tour une barrière de ${pct(a.pct)} de tes PV max.`,
      };
    case 'delayed_buff':
      return {
        icon: '🔥',
        label: `Fureur différée (tour ${a.afterRounds})`,
        detail: `Au tour ${a.afterRounds}, +${pct(a.dmg)} de dégâts à toute l'équipe jusqu'à la fin.`,
      };
    case 'threat':
      return { icon: '📛', label: 'Agressivité', detail: `Les ennemis te ciblent bien plus souvent (+${pct(a.value)}).` };
    case 'dot_amp':
      return {
        icon: '☠️',
        label: 'Poison concentré',
        detail: `+${pct(a.bonus)} de dégâts à chaque tic de ${STATUS_LABEL[a.status]}.`,
      };
    case 'heal_buff':
      return {
        icon: '💫',
        label: 'Second souffle',
        detail: `Soigner un allié sous 50% PV lui donne +${pct(a.atk)} ATK (${a.duration} tours).`,
      };
    case 'riposte_shield':
      return {
        icon: '💥',
        label: 'Contrecoup',
        detail: `Renvoie ${pct(a.bonus)} des dégâts quand ta barrière est brisée.`,
      };
    case 'riposte_dodge':
      return {
        icon: '⚔️',
        label: 'Riposte',
        detail: `Chaque esquive déclenche une contre-attaque (${pct(a.bonus)} d'une frappe).`,
      };
    case 'bonus_strike':
      return {
        icon: '🔪',
        label: 'Frappe enchaînée',
        detail: `Chaque attaque enchaîne une frappe de plus (${pct(a.mult)} des dégâts).`,
      };
    case 'on_first_hit':
      return {
        icon: '🌑',
        label: `Ouverture : ${STATUS_LABEL[a.status]}`,
        detail: `Le premier coup du combat applique ${STATUS_LABEL[a.status]} à coup sûr (${a.duration} tours).`,
      };
    case 'team_hot':
      return {
        icon: '🕯️',
        label: "Bénédiction (soin sur la durée)",
        detail: `${pct(a.chance)}/tour de soigner l'équipe de ${pct(a.pct)} PV/tour (${a.duration} tours).`,
      };
    case 'rally_death':
      return {
        icon: '💀',
        label: 'Sacre du carnage',
        detail: `+${pct(a.value)} ATK & DEF à chaque mort sur le champ de bataille (cumulatif, les deux camps).`,
      };
    case 'hp_strike':
      return {
        icon: '🗿',
        label: 'Frappe titanesque (set Lourd)',
        detail: `+${pct(a.value)} de tes PV max en dégâts bonus à chaque attaque.`,
      };
    case 'double_strike':
      return {
        icon: '🗡️',
        label: 'Double frappe (set Moyen)',
        detail: `Une 2e attaque chaque tour ; chaque frappe à ${pct(a.mult)} des dégâts.`,
      };
    case 'cdr':
      return {
        icon: '⏱️',
        label: 'Cadence (set Léger)',
        detail: `−${a.value} tour de cooldown sur tous tes actifs.`,
      };
    case 'atk_ramp':
      return {
        icon: '📈',
        label: 'Furie croissante',
        detail: `Dégâts +${pct(a.perTurn)} par tour (cumulatif).`,
      };
    case 'summon':
      return {
        icon: '🧟',
        label: 'Invocation',
        detail: `Invoque ${a.count} × ${a.summonName} au début du combat (${pct(a.atkMult)} ATK / ${pct(a.hpMult)} PV du lanceur)${a.explodeDmgMult ? `, qui explose à sa mort (×${a.explodeDmgMult} ATK en zone)` : ''}.`,
      };
    case 'explode_on_death':
      return {
        icon: '💥',
        label: 'Explosion',
        detail:
          a.hpFrac !== undefined
            ? `À sa mort, explose en dégâts de zone (${pct(a.hpFrac)} de ses PV max).`
            : `À sa mort, explose en dégâts de zone (×${a.dmgMult ?? 0} ATK).`,
      };
    case 'summon_pool':
      return {
        icon: '🧟',
        label: 'Invocation aléatoire',
        detail: `Invoque ${a.distinct ? 'un de chaque' : `${a.count} au hasard`} parmi : ${a.templates
          .map((t) => t.name)
          .join(', ')}.`,
      };
    case 'summon_buff':
      return {
        icon: '💪',
        label: `Renfort d'invocations (${a.stat === 'atk' ? 'ATK' : 'PV'})`,
        detail: `+${pct(a.value)} ${a.stat === 'atk' ? 'ATK' : 'PV'} à toutes tes invocations.`,
      };
    case 'summon_explode':
      return {
        icon: '💣',
        label: 'Ossuaire',
        detail: `Tes invocations explosent à leur mort (${pct(a.hpFrac)} de leurs PV max en zone).`,
      };
    case 'bone_stack':
      return {
        icon: '🦴',
        label: "Récolte d'os",
        detail: `${pct(a.chance)} de convertir ton attaque en stack d'os (cumulable).`,
      };
    case 'bone_ritual':
      return {
        icon: '☠️',
        label: 'Rituel mortuaire',
        detail: `À ${a.threshold} stacks d'os, invoque ${a.name} (${pct(a.atkMult)} ATK / ${pct(a.hpMult)} PV du lanceur).`,
      };
    case 'purge':
      return {
        icon: '⛓️',
        label: 'Dissipation',
        detail: `${pct(a.chance)} de chance de dissiper un bienfait (buff) de la cible à l'attaque.`,
      };
    case 'drain_aura':
      return {
        icon: '🩸',
        label: 'Drain de vie',
        detail: `${pct(a.pct)} des dégâts infligés soignent l'allié le plus blessé.`,
      };
    case 'amp_vs_buff':
      return {
        icon: '⚖️',
        label: 'Jugement',
        detail: `+${pct(a.bonus)} de dégâts contre une cible qui porte un bienfait.`,
      };
    case 'purge_stack':
      return {
        icon: '📜',
        label: "Sceau d'affaiblissement",
        detail: `+${pct(a.value)} de dégâts par bienfait dissipé, cumulable sans limite jusqu'à la fin du combat.`,
      };
  }
}

/* ------------------------------------------------------------- équipement -- */

function EquipmentPanel({ hero, allHeroes }: { hero: HeroView; allHeroes: HeroView[] }) {
  const { data: items } = useItems();
  const { equip, unequip } = useEquip();

  // Le message du `raise exception` SQL arrive intact dans l'erreur du RPC. Il
  // était jeté sans être affiché : le clic échouait en silence. Le verrou
  // d'expédition a disparu, mais les autres refus (poids de classe, set réservé)
  // passent par le même chemin et méritent toujours d'être lus.
  const failure = equip.error ?? unequip.error;
  const error = failure ? (failure instanceof Error ? failure.message : 'Action impossible') : null;

  // Objets déjà portés par un héros (les leurs restent indisponibles ailleurs).
  const equippedIds = useMemo(() => {
    const set = new Set<string>();
    for (const h of allHeroes) {
      for (const it of [h.weapon, h.armor, h.jewel, h.relic]) if (it) set.add(it.id);
    }
    return set;
  }, [allHeroes]);

  const current: Record<Slot, HeroView['weapon']> = {
    weapon: hero.weapon,
    armor: hero.armor,
    jewel: hero.jewel,
    relic: hero.relic,
  };

  return (
    <div className="panel space-y-3 p-4">
      <h3 className="font-display font-semibold text-[var(--color-ink)]">Équipement</h3>
      <div className="space-y-2">
        {SLOT_META.map((sm) => (
          <EquipSlot
            key={sm.slot}
            label={sm.label}
            iconSrc={sm.iconSrc}
            item={current[sm.slot]}
            candidates={(items ?? []).filter(
              (it) =>
                it.item_type === sm.slot &&
                !equippedIds.has(it.id) &&
                (sm.slot === 'jewel' || sm.slot === 'relic' || it.set_id
                  ? true
                  : canEquipWeight(hero.classId, it.weight as ItemWeight | null)),
            )}
            onEquip={(itemId) => equip.mutate({ heroId: hero.id, itemId, slot: sm.slot })}
            onUnequip={() => unequip.mutate({ heroId: hero.id, slot: sm.slot })}
            busy={equip.isPending || unequip.isPending}
          />
        ))}

        {/* 5e slot, réservé aux héros ÉVEILLÉS : la rune. Elle ne vit pas dans
            `items` mais dans sa propre table, d'où un slot dédié plutôt qu'une
            entrée de SLOT_META. Masqué tant que le héros n'est pas éveillé —
            afficher un slot définitivement vide n'apprendrait rien. */}
        {hero.awakened && <RuneSlot hero={hero} allHeroes={allHeroes} />}
      </div>


      {error && (
        <p className="text-[11px] text-[var(--color-ember)]">{error}</p>
      )}
    </div>
  );
}

/**
 * Slot de RUNE (héros éveillé). Une rune scelle l'effet 2-pièces d'un set et
 * l'accorde au héros sans occuper le moindre slot d'équipement — c'est la
 * récompense de l'éveil. Une rune déjà portée par un autre héros n'est pas
 * proposée ici.
 */
function RuneSlot({ hero, allHeroes }: { hero: HeroView; allHeroes: HeroView[] }) {
  const { data: runes } = useRunes();
  const { equip } = useRuneActions();
  const [open, setOpen] = useState(false);

  const takenByOthers = useMemo(() => {
    const set = new Set<string>();
    for (const h of allHeroes) if (h.id !== hero.id && h.runeId) set.add(h.runeId);
    return set;
  }, [allHeroes, hero.id]);

  const all = runes ?? [];
  const worn = all.find((r) => r.id === hero.runeId) ?? null;
  const available = all.filter((r) => r.id !== hero.runeId && !takenByOthers.has(r.id));
  const setName = (setId: string) => SETS.find((s) => s.id === setId)?.name ?? setId;
  /** Effet 2 pièces du set scellé — vide si le set a disparu du catalogue. */
  const effectOf = (setId: string) => {
    const s = SETS.find((x) => x.id === setId);
    return s ? describeSetEffect(s) : '';
  };

  return (
    <div className="rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/[0.06] p-2.5">
      <div className="flex items-center gap-2.5">
        <UiIcon name="jewel" size={28} color="var(--color-arcane)" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-arcane)]">
            Rune · éveillé
          </div>
          <div
            className={`truncate text-sm font-medium ${worn ? 'text-[var(--color-ink)]' : 'text-[var(--color-muted)]/60'}`}
          >
            {worn ? setName(worn.set_id) : 'Aucune rune'}
          </div>
          {worn && (
            <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
              {effectOf(worn.set_id)}
            </p>
          )}
        </div>
        {worn && (
          <button
            onClick={() => equip.mutate({ heroId: hero.id, runeId: null })}
            disabled={equip.isPending}
            title="Retirer la rune"
            className="shrink-0 px-1 text-[var(--color-muted)]/60 transition hover:text-[var(--color-ember)] disabled:opacity-40"
          >
            ✕
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md border border-[var(--color-edge)] px-2 py-1 text-[11px] font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-arcane)] hover:text-[var(--color-ink)]"
        >
          {open ? 'Fermer' : 'Changer'}
        </button>
      </div>

      {open && (
        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto border-t border-[var(--color-edge)] pt-2">
          {available.length === 0 ? (
            <p className="px-1 text-[11px] text-[var(--color-muted)]/70">
              Aucune rune disponible — forge-en une à l'Autel des Runes.
            </p>
          ) : (
            available.map((r) => (
              <button
                key={r.id}
                onClick={() => {
                  equip.mutate({ heroId: hero.id, runeId: r.id });
                  setOpen(false);
                }}
                disabled={equip.isPending}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 disabled:opacity-40"
              >
                <UiIcon name="jewel" size={20} color="var(--color-arcane)" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-[var(--color-ink)]">
                    {setName(r.set_id)}
                  </span>
                  <span className="block truncate text-[10px] text-[var(--color-muted)]">
                    {effectOf(r.set_id)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EquipSlot({
  label,
  iconSrc,
  item,
  candidates,
  onEquip,
  onUnequip,
  busy,
}: {
  label: string;
  iconSrc: string;
  item: HeroView['weapon'];
  candidates: ItemRow[];
  onEquip: (itemId: string) => void;
  onUnequip: () => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-[var(--color-edge)] bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2.5">
        {item ? (
          <EquipmentIcon item={item} size={32} color={rarityColor(item.rarity)} className="shrink-0" />
        ) : (
          <SyntyImg src={iconSrc} size={28} className="shrink-0 opacity-90" title={label} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
            {label}
          </div>
          <div
            className={`truncate text-sm font-medium ${item ? '' : 'text-[var(--color-muted)]/60'}`}
            style={item ? { color: rarityColor(item.rarity) } : undefined}
          >
            {item ? item.name : 'Aucun objet'}
          </div>
          {item && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <RarityBadge rarity={item.rarity} compact />
              <ZoneUpgradeStars zone={materialZone(item)} upgrade={item.upgrade_level} size={12} />
              <ItemBrief item={item} />
            </div>
          )}
        </div>
        {item && (
          <button
            onClick={onUnequip}
            disabled={busy}
            title="Retirer"
            className="shrink-0 px-1 text-[var(--color-muted)]/60 transition hover:text-[var(--color-ember)] disabled:opacity-40"
          >
            ✕
          </button>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 rounded-md border border-[var(--color-edge)] px-2 py-1 text-[11px] font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-arcane)] hover:text-[var(--color-ink)]"
        >
          {open ? 'Fermer' : 'Changer'}
        </button>
      </div>

      {open && (
        <div className="mt-2 max-h-60 space-y-1 overflow-y-auto border-t border-[var(--color-edge)] pt-2">
          {candidates.length === 0 ? (
            <p className="px-1 text-[11px] text-[var(--color-muted)]/70">
              Aucun objet compatible disponible.
            </p>
          ) : (
            candidates.map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  onEquip(it.id);
                  setOpen(false);
                }}
                disabled={busy}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 disabled:opacity-40"
              >
                <EquipmentIcon item={it} size={22} color={rarityColor(it.rarity)} />
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                  style={{ color: rarityColor(it.rarity) }}
                >
                  {it.name}
                </span>
                <ItemBrief item={it} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type ItemStatLike = {
  item_type?: string | null;
  passive_type?: string | null;
  passive_value?: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

/**
 * Stat PRINCIPALE par type, telle que `rollBonuses` la génère : l'arme ne rolle
 * que de l'ATK, armure/relique partent de la DEF (leurs PV sont un dérivé ×2, donc
 * numériquement plus gros — d'où un ordre figé plutôt qu'un tri par valeur).
 */
const MAIN_STAT: Record<string, 'atk' | 'def' | 'hp'> = {
  weapon: 'atk',
  armor: 'def',
  relic: 'def',
};

function ItemBrief({ item }: { item: ItemStatLike }) {
  // On liste ce que l'objet PORTE, sans présumer de son type. Masquer les stats
  // des bijoux partait de « bijou ⟹ passif uniquement » : vrai pour un bijou
  // serti, faux pour un bijou de SET, qui n'a aucun passif mais des stats brutes
  // — il s'affichait donc totalement vide. Les stats nulles sont de toute façon
  // filtrées juste en dessous, un bijou serti n'affichera donc rien de plus.
  const passive =
    item.passive_type && (item.passive_value ?? 0) > 0
      ? (PASSIVE_META[item.passive_type as PassiveType]?.label ?? item.passive_type)
      : null;

  const stats: { key: 'atk' | 'def' | 'hp'; text: string }[] = (
    [
      { key: 'atk', text: item.atk_bonus ? `+${item.atk_bonus} ATK` : '' },
      { key: 'def', text: item.def_bonus ? `+${item.def_bonus} DEF` : '' },
      { key: 'hp', text: item.hp_bonus ? `+${item.hp_bonus} PV` : '' },
    ] as const
  )
    .filter((s) => s.text)
    .map((s) => ({ key: s.key, text: s.text }));

  // La principale d'abord (mise en avant), les secondaires ensuite en atténué.
  const main = MAIN_STAT[item.item_type ?? ''];
  const ordered = main ? [...stats].sort((a, b) => (b.key === main ? 1 : 0) - (a.key === main ? 1 : 0)) : stats;
  const [primary, ...secondary] = ordered;

  if (!primary && !passive) {
    return <span className="shrink-0 text-[10px] text-[var(--color-muted)]">—</span>;
  }

  const tail = [
    ...secondary.map((s) => s.text),
    passive ? `${passive} +${item.passive_value}%` : null,
  ].filter(Boolean);

  return (
    <span className="shrink-0 text-[10px]">
      {primary ? (
        <span className="font-semibold text-[var(--color-ink)]">{primary.text}</span>
      ) : (
        // Bijou : le passif EST la stat principale.
        <span className="font-semibold text-[var(--color-arcane)]">
          {passive} +{item.passive_value}%
        </span>
      )}
      {primary && tail.length ? (
        <span className="text-[var(--color-muted)]"> · {tail.join(' · ')}</span>
      ) : null}
    </span>
  );
}
