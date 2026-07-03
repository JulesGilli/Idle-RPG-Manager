import { useState } from 'react';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityMeta } from '@/lib/gameUi';
import { RELIC_BASES, relicRecipe, relicRanges } from '@shared/progression/relic';
import { useForge, type CraftedItem } from '@/features/forge/useForge';
import { RarityFrame } from '@/components/synty/RarityFrame';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { SyntyGlyph } from '@/components/synty/SyntyIcon';
import { UiIcon, RelicIcon } from '@/components/synty/GameIcons';
import { rarityHex, STAT_GLYPH } from '@/lib/synty';
import { BackToVillage } from '@/components/BackToVillage';

const STAT_TINT = { atk: '#fb7185', def: '#56b6f4', hp: '#5fd39b' } as const;

/**
 * Autel des Reliques — bâtiment dédié : on n'y forge QUE des reliques,
 * à partir du butin de donjon. Distinct de la Forge (armes/armures) et de la
 * Joaillerie (bijoux).
 */
export function RelicScreen() {
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { craftRelic } = useForge();
  const [baseId, setBaseId] = useState<string>(RELIC_BASES[0]!.id);
  const [lastCrafted, setLastCrafted] = useState<CraftedItem | null>(null);

  const gold = profile?.gold ?? 0;
  const res = resources ?? {};
  const base = RELIC_BASES.find((b) => b.id === baseId) ?? RELIC_BASES[0]!;
  const recipe = relicRecipe(base);
  const ranges = relicRanges(base);

  const enoughGold = gold >= recipe.gold;
  const ok = enoughGold && recipe.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div>
        <h2 className="heading flex items-center gap-2 text-2xl">
          <UiIcon name="relic" size={24} color="var(--color-gold-soft)" />
          Autel des Reliques
        </h2>
        <p className="text-sm text-[var(--color-muted)]">
          Le gardien de l'autel façonne des reliques à partir du butin des donjons. Stats brutes
          (grosse composante PV), rareté à % globaux (−20 % Médiocre → +35 % Ultime). Pas de passif —
          c'est le domaine des bijoux.
        </p>
      </div>

      {/* Choix du modèle */}
      <div className="flex flex-wrap gap-2">
        {RELIC_BASES.map((b) => (
          <button
            key={b.id}
            onClick={() => setBaseId(b.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm transition ${
              base.id === b.id
                ? 'border-[var(--color-arcane)] bg-[var(--color-arcane)]/15 text-white'
                : 'border-[var(--color-edge)] bg-[var(--color-panel)] text-[var(--color-muted)] hover:border-[var(--color-edge-strong)]'
            }`}
          >
            <RelicIcon baseId={b.id} size={18} /> {b.label}
          </button>
        ))}
      </div>

      {/* Aperçu : stats possibles + coût */}
      <div className="panel p-4">
        <div className="mb-1 flex items-center gap-1.5 font-display text-sm font-semibold text-[var(--color-ink)]">
          <RelicIcon baseId={base.id} size={18} /> {base.label}
        </div>
        <div className="flex flex-wrap gap-3 text-xs">
          {ranges.atk[1] > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
              <SyntyGlyph src={STAT_GLYPH.atk} color={STAT_TINT.atk} size={13} /> ATK {ranges.atk[0]}–
              {ranges.atk[1]}
            </span>
          )}
          {ranges.def[1] > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
              <SyntyGlyph src={STAT_GLYPH.def} color={STAT_TINT.def} size={13} /> DEF {ranges.def[0]}–
              {ranges.def[1]}
            </span>
          )}
          {ranges.hp[1] > 0 && (
            <span className="inline-flex items-center gap-1 text-[var(--color-ink)]/85">
              <SyntyGlyph src={STAT_GLYPH.hp} color={STAT_TINT.hp} size={13} /> PV {ranges.hp[0]}–
              {ranges.hp[1]}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`inline-flex items-center gap-1 ${
              enoughGold ? 'text-[var(--color-gold-soft)]' : 'text-[var(--color-ember)]'
            }`}
          >
            <UiIcon name="gold" size={13} /> {recipe.gold}
          </span>
          {recipe.materials.map((m) => {
            const have = res[m.key] ?? 0;
            const enough = have >= m.qty;
            return (
              <span
                key={m.key}
                className={`inline-flex items-center gap-1 ${
                  enough ? 'text-[var(--color-ink)]/80' : 'text-[var(--color-ember)]'
                }`}
              >
                <ResourceIcon resKey={m.key} /> {resourceMeta(m.key).label} : {have}/{m.qty}
              </span>
            );
          })}
        </div>
      </div>

      {craftRelic.isError && (
        <p className="text-sm text-[var(--color-ember)]">
          {craftRelic.error instanceof Error ? craftRelic.error.message : 'Erreur'}
        </p>
      )}

      <button
        onClick={() => {
          setLastCrafted(null);
          craftRelic.mutate({ baseId: base.id }, { onSuccess: (r) => setLastCrafted(r.item) });
        }}
        disabled={!ok || craftRelic.isPending}
        className="btn btn-primary w-full text-sm"
      >
        {craftRelic.isPending ? 'Forge…' : `Forger : ${base.label}`}
      </button>

      {lastCrafted && (
        <RarityFrame color={rarityHex(lastCrafted.rarity)} className="anim-pop">
          <div className="flex items-center justify-between gap-3 rounded-[0.9rem] bg-[var(--color-panel-2)] p-3 text-sm">
            <span className="flex items-center gap-2">
              <UiIcon name="relic" size={20} />
              <span className={`font-display font-semibold ${rarityMeta(lastCrafted.rarity).text}`}>
                {lastCrafted.name}
              </span>
            </span>
            <span className="text-xs text-[var(--color-muted)]">
              {[
                lastCrafted.atk_bonus ? `+${lastCrafted.atk_bonus} ATK` : null,
                lastCrafted.def_bonus ? `+${lastCrafted.def_bonus} DEF` : null,
                lastCrafted.hp_bonus ? `+${lastCrafted.hp_bonus} PV` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        </RarityFrame>
      )}
    </section>
  );
}
