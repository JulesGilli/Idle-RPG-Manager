import { useHeroes } from '@/features/heroes/useHeroes';
import { useRunes, useRuneActions } from './useRunes';
import { canAwaken, runeExtractableSets, AWAKEN_COST, RUNE_CRAFT_COST } from '@shared/progression/runes';
import { setById } from '@shared/progression/sets';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { classMeta } from '@/lib/gameUi';
import { BackToVillage } from '@/components/BackToVillage';
import { useArc } from '@/features/arc/useArc';
import { AltarScene } from './AltarScene';

function setName(setId: string): string {
  return setById(setId)?.name ?? setId;
}

export function RunesScreen() {
  const { data: heroes } = useHeroes();
  const { data: runes } = useRunes();
  const { awaken, craft, equip } = useRuneActions();
  const { maxArc } = useArc();

  // Autel réservé à l'end-game : verrouillé tant que l'Arc 2 n'est pas atteint
  // (protège aussi l'accès par URL directe, pas seulement le lien du village).
  if (maxArc < 2) {
    return (
      <section className="anim-fade space-y-5">
        <BackToVillage />
        <div className="panel p-5">
          <h2 className="heading flex items-center gap-2 text-xl">
            <UiIcon name="relic" size={22} color="var(--color-arcane)" />
            Autel des Runes
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            L'Autel des Runes se débloque en atteignant l'Arc 2. Progresse dans l'aventure pour
            éveiller tes héros et sceller l'effet des sets dans des runes.
          </p>
        </div>
      </section>
    );
  }

  const list = heroes ?? [];
  const eligible = list.filter((h) => canAwaken(h.grade, h.level, h.awakened));
  const awakened = list.filter((h) => h.awakened);
  const ownedRunes = runes ?? [];

  return (
    <section className="anim-fade space-y-5">
      <BackToVillage />

      <div className="panel relative overflow-hidden p-0">
        <AltarScene />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5">
          <h2 className="heading flex items-center gap-2 text-xl">
            <UiIcon name="relic" size={22} color="var(--color-arcane)" />
            Autel des Runes
          </h2>
          <p className="mt-1 max-w-xl text-sm text-white/80">
            Éveille tes héros de grade S au niveau max pour leur ouvrir un slot de rune. Sacrifie un
            set complet (2 pièces) pour en sceller l'effet dans une rune, à poser sur un héros éveillé.
          </p>
        </div>
      </div>

      {/* Éveil */}
      <div className="panel p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-[var(--color-ink)]">Éveil</h3>
        <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
          Coût par éveil : <span className="font-semibold text-[var(--color-ink)]">{AWAKEN_COST.gold.toLocaleString('fr-FR')}</span>
          <UiIcon name="gold" size={11} color="var(--color-gold-soft)" /> +
          <span className="inline-flex items-center gap-1"><ResourceIcon resKey={AWAKEN_COST.material.key} /> {AWAKEN_COST.material.qty}</span>
        </p>
        {eligible.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Aucun héros éligible (grade S au niveau max requis).</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {eligible.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-edge)] p-2">
                <span className="flex items-center gap-2 text-sm">
                  <ClassIcon classId={h.classId} size={20} />
                  <span>
                    {h.name} <span className="text-[10px]" style={{ color: classMeta(h.classId).accent }}>N.{h.level} · {h.grade}</span>
                  </span>
                </span>
                <button
                  onClick={() => awaken.mutate(h.id)}
                  disabled={awaken.isPending}
                  className="btn btn-arcane text-xs"
                >
                  Éveiller
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Craft de runes */}
      <div className="panel p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-[var(--color-ink)]">Sceller une rune</h3>
        <p className="mb-3 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
          Consomme les 2 pièces du set + <span className="font-semibold text-[var(--color-ink)]">{RUNE_CRAFT_COST.gold.toLocaleString('fr-FR')}</span>
          <UiIcon name="gold" size={11} color="var(--color-gold-soft)" /> +
          <span className="inline-flex items-center gap-1"><ResourceIcon resKey={RUNE_CRAFT_COST.material.key} /> {RUNE_CRAFT_COST.material.qty}</span>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {runeExtractableSets().map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-edge)] p-2">
              <span className="min-w-0">
                <span className="block text-sm text-[var(--color-ink)]">{s.name}</span>
                <span className="block text-[10px] text-[var(--color-muted)]">{s.theme}</span>
              </span>
              <button
                onClick={() => craft.mutate(s.id)}
                disabled={craft.isPending}
                className="btn text-xs"
                style={{ background: 'var(--color-arcane)', color: 'white' }}
              >
                Sceller
              </button>
            </div>
          ))}
        </div>
        {craft.isError && <p className="mt-2 text-xs text-[var(--color-ember)]">{craft.error instanceof Error ? craft.error.message : 'Erreur'}</p>}
      </div>

      {/* Héros éveillés + équipement de rune */}
      <div className="panel p-4">
        <h3 className="mb-2 font-display text-sm font-bold text-[var(--color-ink)]">Héros éveillés · slot de rune</h3>
        {awakened.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Aucun héros éveillé pour l'instant.</p>
        ) : (
          <div className="space-y-2">
            {awakened.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-gold-soft)]/30 bg-[var(--color-gold-soft)]/[0.05] p-2">
                <span className="flex items-center gap-2 text-sm">
                  <ClassIcon classId={h.classId} size={20} />
                  {h.name} <span className="text-[10px] text-[var(--color-gold-soft)]">✦ éveillé</span>
                </span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                  Rune :
                  <select
                    value={h.runeId ?? ''}
                    onChange={(e) => equip.mutate({ heroId: h.id, runeId: e.target.value || null })}
                    disabled={equip.isPending}
                    className="rounded border border-[var(--color-edge)] bg-[var(--color-panel)] px-1 py-0.5 text-[var(--color-ink)]"
                  >
                    <option value="">— aucune —</option>
                    {ownedRunes.map((r) => (
                      <option key={r.id} value={r.id}>
                        {setName(r.set_id)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
        )}
        {ownedRunes.length > 0 && (
          <p className="mt-2 text-[10px] text-[var(--color-muted)]">
            Runes possédées : {ownedRunes.map((r) => setName(r.set_id)).join(', ')}
          </p>
        )}
      </div>
    </section>
  );
}
