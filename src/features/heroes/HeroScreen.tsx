import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useHeroes, useRenameHero, HERO_NAME_MAX, type HeroView } from './useHeroes';
import { useItems, useEquip, type ItemRow } from './useItems';
import { classMeta, rarityColor } from '@/lib/gameUi';
import { ZoneUpgradeStars } from '@/components/ItemStars';
import { materialZone } from '@/lib/itemZone';
import { GRADE_META } from '@shared/progression/recruit';
import { computeAbilities, computePassives } from '@shared/progression/skills';
import { PASSIVE_META } from '@shared/progression/jewelry';
import { canEquipWeight, type ItemWeight } from '@shared/progression/loot';
import type { Ability, PassiveType, StatusType } from '@shared/combat';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon, EquipmentIcon, PassiveIcon } from '@/components/synty/GameIcons';
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
      <HeroHeader hero={hero} onBack={() => navigate('/squad')} />
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
      to="/squad"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
    >
      <span aria-hidden>←</span> Retour à l'escouade
    </Link>
  );
}

/* ---------------------------------------------------------------- header -- */

function HeroHeader({ hero, onBack }: { hero: HeroView; onBack: () => void }) {
  const meta = classMeta(hero.classId);
  const grade = GRADE_META[hero.grade];
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));

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
          to="/library"
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

function StatsPanel({ hero }: { hero: HeroView }) {
  // Passifs de combat effectifs = gemme du bijou + passifs de l'arbre (même
  // agrégation qu'en combat, cf. resolve-deployment).
  const passives = useMemo(() => {
    const map = new Map<PassiveType, number>();
    const add = (t: PassiveType, v: number) => map.set(t, (map.get(t) ?? 0) + v);
    if (hero.jewel?.passive_type && (hero.jewel.passive_value ?? 0) > 0) {
      add(hero.jewel.passive_type as PassiveType, (hero.jewel.passive_value ?? 0) / 100);
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

  const crit = passives.get('crit') ?? 0;
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
                title={PASSIVE_META[type].label}
              >
                <PassiveIcon passive={type} size={13} />
                {PASSIVE_META[type].label}
                <span className="text-[var(--color-arcane)]">{pct(value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
          {hero.sets.map((s) => (
            <span
              key={s.set.id}
              className="chip bg-[var(--color-gold)]/15 text-[10px] text-[var(--color-gold-soft)]"
              title={s.set.theme}
            >
              {s.set.name} {Math.min(4, s.count)}/4
            </span>
          ))}
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
    case 'team_hot':
      return {
        icon: '🕯️',
        label: "Bénédiction (soin sur la durée)",
        detail: `${pct(a.chance)}/tour de soigner l'équipe de ${pct(a.pct)} PV/tour (${a.duration} tours).`,
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
  }
}

/* ------------------------------------------------------------- équipement -- */

function EquipmentPanel({ hero, allHeroes }: { hero: HeroView; allHeroes: HeroView[] }) {
  const { data: items } = useItems();
  const { equip, unequip } = useEquip();

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
      </div>
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
  passive_type?: string | null;
  passive_value?: number;
  atk_bonus: number;
  def_bonus: number;
  hp_bonus: number;
};

function ItemBrief({ item }: { item: ItemStatLike }) {
  if (item.passive_type && (item.passive_value ?? 0) > 0) {
    const meta = PASSIVE_META[item.passive_type as PassiveType];
    return (
      <span className="shrink-0 text-[10px] text-[var(--color-arcane)]">
        {meta?.label ?? item.passive_type} +{item.passive_value}%
      </span>
    );
  }
  const parts = [
    item.atk_bonus ? `+${item.atk_bonus} ATK` : null,
    item.def_bonus ? `+${item.def_bonus} DEF` : null,
    item.hp_bonus ? `+${item.hp_bonus} PV` : null,
  ].filter(Boolean);
  return (
    <span className="shrink-0 text-[10px] text-[var(--color-muted)]">{parts.join(' · ') || '—'}</span>
  );
}
