import { Link, useNavigate } from 'react-router-dom';
import { useCatchUpXp, type HeroView } from '@/features/heroes/useHeroes';
import { useEquip } from '@/features/heroes/useItems';
import { useHeroDeployments, type HeroDeployment } from '@/features/heroes/useHeroDeployment';
import { useHeroAvailability } from '@/features/heroes/useHeroAvailability';
import { classMeta, rarityColor, heroWeight } from '@/lib/gameUi';
import { GRADE_META } from '@shared/progression/recruit';
import { setEffectAt } from '@shared/progression/sets';
import { SyntyGlyph, SyntyImg } from '@/components/synty/SyntyIcon';
import { UiIcon } from '@/components/synty/GameIcons';
import { syntyUrl, STAT_GLYPH } from '@/lib/synty';
import { HeroAvatar } from '@/components/HeroAvatar';

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
  locked = false,
}: {
  iconSrc: string;
  label: string;
  item: HeroView['weapon'];
  onUnequip: () => void;
  disabled: boolean;
  /** Héros parti en expédition : le serveur refuse de toucher à son équipement. */
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-[var(--color-muted)]">
        <SyntyImg src={iconSrc} size={16} className="opacity-90" title={label} />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          className={item ? '' : 'text-[var(--color-muted)]/60'}
          style={item ? { color: rarityColor(item.rarity) } : undefined}
        >
          {item ? item.name : '—'}
        </span>
        {item &&
          (locked ? (
            // Le cadenas REMPLACE la croix : proposer un bouton que le serveur
            // rejettera n'apprend rien au joueur, qui cliquait dans le vide.
            <span
              title="Héros en expédition — équipement verrouillé jusqu'à son retour"
              className="cursor-not-allowed text-[var(--color-muted)]/60"
            >
              <UiIcon name="lock" size={13} />
            </span>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUnequip();
              }}
              disabled={disabled}
              title="Retirer"
              className="text-[var(--color-muted)]/60 transition hover:text-[var(--color-ember)] disabled:opacity-40"
            >
              ✕
            </button>
          ))}
      </span>
    </div>
  );
}

/** Pastille « où ce héros est déployé » (localisation concrète). */
export function DeployBadge({ deployment }: { deployment: HeroDeployment }) {
  const busy = deployment.tone === 'busy';
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        busy
          ? 'bg-[var(--color-gold)]/15 text-[var(--color-gold-soft)]'
          : 'bg-emerald-500/10 text-emerald-300'
      }`}
      title={deployment.label}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${busy ? 'bg-[var(--color-gold)]' : 'bg-emerald-400'}`}
      />
      <span className="truncate">{deployment.label}</span>
    </span>
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
  const navigate = useNavigate();
  const meta = classMeta(hero.classId);
  const weight = heroWeight(hero.classId);
  const catchUp = useCatchUpXp();
  const boosted = catchUp.isBoosted(hero.level);
  const grade = GRADE_META[hero.grade];
  const xpPct = Math.min(100, Math.round((hero.xp / hero.xpToNext) * 100));
  const deployment = useHeroDeployments().get(hero.id);
  // `equip_item` / `unequip_item` refusent tout héros en expédition (verrou SQL,
  // migration 0069). On l'affiche ici plutôt que de laisser le clic échouer.
  const onExpedition = useHeroAvailability().get(hero.id) === 'expedition';

  const innateEntries = (
    [
      ['PV', hero.innate.bonus_hp],
      ['ATK', hero.innate.bonus_atk],
      ['DEF', hero.innate.bonus_def],
      ['VIT', hero.innate.bonus_speed],
    ] as const
  ).filter(([, v]) => v !== 0);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/hero/${hero.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/hero/${hero.id}`);
      }}
      title="Voir la fiche du héros"
      className="panel panel-hover anim-slide relative cursor-pointer overflow-hidden p-4"
    >
      {/* accent de classe (aplat) */}
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: meta.accent }} />

      <div className="flex items-start gap-3">
        {/* Portrait : avatar de la classe mis en scène (aura + socle) */}
        <HeroAvatar classId={hero.classId} size={56} className="mt-0.5" />

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
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.badge}`}
                >
                  {hero.className} · Niv. {hero.level}
                </span>
                {weight && (
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ backgroundColor: `${weight.color}1f`, color: weight.color }}
                    title={`Équipement ${weight.label.toLowerCase()} uniquement`}
                  >
                    {weight.label}
                  </span>
                )}
              </div>
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

      {deployment && (
        <div className="mt-3">
          <DeployBadge deployment={deployment} />
        </div>
      )}

      {/* XP */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[10px] text-[var(--color-muted)]">
          <span className="flex items-center gap-1">
            XP
            {boosted && (
              <span
                className="rounded px-1 font-bold text-[var(--color-gold)]"
                style={{ background: 'color-mix(in srgb, var(--color-gold) 18%, transparent)' }}
                title={`Rattrapage : ×${catchUp.mult} d'XP tant que ce héros est sous le niveau ${catchUp.capLevel} (5e héros le plus haut).`}
              >
                ×{catchUp.mult}
              </span>
            )}
          </span>
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
          to={`/library?hero=${hero.id}`}
          onClick={(e) => e.stopPropagation()}
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
          locked={onExpedition}
        />
        <EquipRow
          iconSrc={syntyUrl.weapon('ICON_SM_Wep_Shield_01')}
          label="Armure"
          item={hero.armor}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'armor' })}
          disabled={unequip.isPending}
          locked={onExpedition}
        />
        <EquipRow
          iconSrc={syntyUrl.resource('ICON_SM_Item_Ring_01')}
          label="Bijou"
          item={hero.jewel}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'jewel' })}
          disabled={unequip.isPending}
          locked={onExpedition}
        />
        <EquipRow
          iconSrc={syntyUrl.fw('Gem06')}
          label="Relique"
          item={hero.relic}
          onUnequip={() => unequip.mutate({ heroId: hero.id, slot: 'relic' })}
          disabled={unequip.isPending}
          locked={onExpedition}
        />
      </div>

      {hero.sets.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {hero.sets.map((s) => {
            // Le total était écrit EN DUR à 4 : les petits sets, complets à
            // 2 pièces, s'affichaient « 2/4 » et paraissaient inachevés alors
            // que leur bonus était déjà actif. `HeroScreen` faisait déjà le
            // calcul correct — seul cet affichage-ci était resté en arrière.
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

      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
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
