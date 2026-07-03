import { Link } from 'react-router-dom';
import type { HeroView } from '@/features/heroes/useHeroes';
import { useEquip } from '@/features/heroes/useItems';
import { classMeta, rarityMeta } from '@/lib/gameUi';
import { GRADE_META } from '@shared/progression/recruit';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { classWeaponCleanUrl, syntyUrl, STAT_GLYPH } from '@/lib/synty';

function Stat({
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

function EquipRow({
  iconSrc,
  label,
  item,
  onUnequip,
  disabled,
}: {
  iconSrc: string;
  label: string;
  item: HeroView['weapon'];
  onUnequip: () => void;
  disabled: boolean;
}) {
  const rarity = item ? rarityMeta(item.rarity) : null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
        <SyntyImg src={iconSrc} size={16} className="opacity-90" title={label} />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={item && rarity ? rarity.text : 'text-[var(--color-muted)]/60'}>
          {item ? item.name : '—'}
        </span>
        {item && (
          <button
            onClick={onUnequip}
            disabled={disabled}
            title="Retirer"
            className="text-[var(--color-muted)]/60 transition hover:text-[var(--color-ember)] disabled:opacity-40"
          >
            ✕
          </button>
        )}
      </span>
    </div>
  );
}

export function HeroCard({
  hero,
  onDismiss,
  dismissing = false,
}: {
  hero: HeroView;
  onDismiss?: () => void;
  dismissing?: boolean;
}) {
  const { unequip } = useEquip();
  const meta = classMeta(hero.classId);
  const grade = GRADE_META[hero.grade];
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));

  const innateEntries = (
    [
      ['PV', hero.innate.bonus_hp],
      ['ATK', hero.innate.bonus_atk],
      ['DEF', hero.innate.bonus_def],
      ['VIT', hero.innate.bonus_speed],
    ] as const
  ).filter(([, v]) => v !== 0);

  return (
    <div className="panel panel-hover anim-slide relative overflow-hidden p-4">
      {/* accent de classe (aplat) */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.accent }} />

      <div className="flex items-start gap-3">
        {/* Portrait : anneau médiéval Synty + arme de la classe */}
        <div
          className="relative h-12 w-12 shrink-0 rounded-full"
          style={{ backgroundColor: `${meta.accent}22` }}
          title={hero.className}
        >
          <SyntyGlyph
            src={classWeaponCleanUrl(hero.classId)}
            color={meta.accent}
            size={28}
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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-display flex items-center gap-1.5 truncate text-base font-semibold text-[var(--color-ink)]">
                {hero.name}
                <span
                  className="rounded-full px-1.5 text-[10px] font-bold"
                  style={{
                    color: grade.color,
                    boxShadow: `inset 0 0 0 1px ${grade.color}66`,
                  }}
                  title={`Grade de naissance ${hero.grade}${
                    innateEntries.length > 0
                      ? ` : ${innateEntries
                          .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
                          .join(', ')}`
                      : ''
                  }`}
                >
                  {hero.grade}
                </span>
              </h3>
              <span
                className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
              >
                {hero.className} · Niv. {hero.level}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-[var(--color-muted)]">
                Puiss.
              </div>
              <div className="font-display text-lg font-bold text-[var(--color-gold)]">
                {hero.power}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* XP */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
          <span>XP</span>
          <span>
            {hero.xp} / {hero.xpToNext}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[var(--color-arcane)] to-[#a78bfa] transition-all duration-500"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>

      {/* Roll de naissance */}
      {innateEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {innateEntries.map(([k, v]) => (
            <span
              key={k}
              className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                v > 0 ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-[var(--color-ember)]'
              }`}
              title="Bonus de naissance (inné)"
            >
              {v > 0 ? '+' : ''}
              {v} {k}
            </span>
          ))}
        </div>
      )}

      {/* Points de compétence à dépenser */}
      {hero.skillPoints > 0 && (
        <Link
          to="/library"
          className="mt-3 flex items-center justify-center gap-1 rounded-lg border border-[var(--color-arcane)]/40 bg-[var(--color-arcane)]/10 px-3 py-1.5 text-center text-xs font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-arcane)]/20"
          title="Dépenser à la Bibliothèque du Savoir"
        >
          <UiIcon name="book" size={14} color="var(--color-arcane)" />
          {hero.skillPoints} point(s) de compétence à dépenser
        </Link>
      )}

      {/* Stats */}
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <Stat label="PV" value={hero.stats.hp} glyph={STAT_GLYPH.hp} color="#fb7185" />
        <Stat label="ATK" value={hero.stats.atk} glyph={STAT_GLYPH.atk} color="#f5b544" />
        <Stat label="DEF" value={hero.stats.def} glyph={STAT_GLYPH.def} color="#56b6f4" />
        <Stat label="VIT" value={hero.stats.speed} glyph={STAT_GLYPH.speed} color="#5fd39b" />
      </div>

      <div className="divider my-3" />

      <div className="space-y-1.5">
        <EquipRow
          iconSrc={syntyUrl.weapon('ICON_SM_Wep_Sword_01')}
          label="Arme"
          item={hero.weapon}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'weapon' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          iconSrc={syntyUrl.weapon('ICON_SM_Wep_Shield_01')}
          label="Armure"
          item={hero.armor}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'armor' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          iconSrc={syntyUrl.resource('ICON_SM_Item_Ring_01')}
          label="Bijou"
          item={hero.jewel}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'jewel' })}
          disabled={unequip.isPending}
        />
        <EquipRow
          iconSrc={syntyUrl.fw('Gem06')}
          label="Relique"
          item={hero.relic}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'relic' })}
          disabled={unequip.isPending}
        />
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          disabled={dismissing}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-edge)] py-1.5 text-[11px] text-[var(--color-muted)] transition hover:border-[var(--color-ember)]/60 hover:text-[var(--color-ember)] disabled:opacity-40"
          title="Renvoyer ce héros (définitif — son équipement retourne au sac)"
        >
          <UiIcon name="leave" size={13} color="currentColor" />
          Renvoyer
        </button>
      )}
    </div>
  );
}
