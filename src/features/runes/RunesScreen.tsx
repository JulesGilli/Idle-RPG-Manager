import { useHeroes } from '@/features/heroes/useHeroes';
import { FavStar } from '@/components/FavoriteStar';
import { useRunes, useRuneActions } from './useRunes';
import { canAwaken, runeExtractableSets, AWAKEN_COST, RUNE_CRAFT_COST } from '@shared/progression/runes';
import { setById, describeSetEffect } from '@shared/progression/sets';
import { ClassIcon, UiIcon } from '@/components/synty/GameIcons';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { classMeta } from '@/lib/gameUi';
import { BackToVillage } from '@/components/BackToVillage';
import { useArc } from '@/features/arc/useArc';
import { useResources, resourceMeta } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { AltarScene } from './AltarScene';

function setName(setId: string): string {
  return setById(setId)?.name ?? setId;
}

/**
 * Ce que le joueur POSSÈDE face à un coût, en rouge si insuffisant. L'Autel
 * annonçait le prix sans jamais montrer le solde : impossible de savoir pourquoi
 * un éveil échouait (le serveur répondait « Matériau insuffisant » dans le vide).
 */
function Owned({ have, need, children }: { have: number; need: number; children: React.ReactNode }) {
  const ok = have >= need;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        ok ? 'text-[var(--color-ink)]/80' : 'bg-[var(--color-ember)]/10 text-[var(--color-ember)]'
      }`}
      title={ok ? 'Tu as ce qu’il faut' : 'Il t’en manque'}
    >
      {children} {have.toLocaleString('fr-FR')}/{need.toLocaleString('fr-FR')}
    </span>
  );
}

export function RunesScreen() {
  const { data: heroes } = useHeroes();
  const { data: runes } = useRunes();
  const { awaken, craft, equip } = useRuneActions();
  const { maxArc } = useArc();
  // `useResources` résout déjà le tier qui fait foi : la larme astrale est
  // mutualisée entre arcs (tier 1), donc elle remonte correctement en Arc 2.
  const resources = useResources().data ?? {};
  const { data: profile } = useProfile();
  const gold = profile?.gold ?? 0;
  const larmes = resources[AWAKEN_COST.material.key] ?? 0;

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
        <p className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
          Coût par éveil : <span className="font-semibold text-[var(--color-ink)]">{AWAKEN_COST.gold.toLocaleString('fr-FR')}</span>
          <UiIcon name="gold" size={11} color="var(--color-gold-soft)" /> +
          <span className="inline-flex items-center gap-1"><ResourceIcon resKey={AWAKEN_COST.material.key} /> {AWAKEN_COST.material.qty}</span>
          <span className="text-[var(--color-muted)]/70">({resourceMeta(AWAKEN_COST.material.key).label})</span>
        </p>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--color-muted)]">Tu possèdes :</span>
          <Owned have={gold} need={AWAKEN_COST.gold}>
            <UiIcon name="gold" size={11} color="var(--color-gold-soft)" />
          </Owned>
          <Owned have={larmes} need={AWAKEN_COST.material.qty}>
            <ResourceIcon resKey={AWAKEN_COST.material.key} />
          </Owned>
        </p>
        {awaken.isError && (
          <p className="mb-2 rounded-lg border border-[var(--color-ember)]/40 bg-[var(--color-ember)]/10 px-2.5 py-1.5 text-xs text-[var(--color-ember)]">
            {awaken.error instanceof Error ? awaken.error.message : 'Erreur'}
          </p>
        )}
        {eligible.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Aucun héros éligible (grade S au niveau max requis).</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {eligible.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-edge)] p-2">
                <span className="flex items-center gap-2 text-sm">
                  <ClassIcon classId={h.classId} size={20} />
                  <span>
                    <FavStar on={h.favorite} />{h.name} <span className="text-[10px]" style={{ color: classMeta(h.classId).accent }}>N.{h.level} · {h.grade}</span>
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
        <p className="mb-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-muted)]">
          Consomme les 2 pièces du set + <span className="font-semibold text-[var(--color-ink)]">{RUNE_CRAFT_COST.gold.toLocaleString('fr-FR')}</span>
          <UiIcon name="gold" size={11} color="var(--color-gold-soft)" /> +
          <span className="inline-flex items-center gap-1"><ResourceIcon resKey={RUNE_CRAFT_COST.material.key} /> {RUNE_CRAFT_COST.material.qty}</span>
          <span className="text-[var(--color-muted)]/70">({resourceMeta(RUNE_CRAFT_COST.material.key).label})</span>
        </p>
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--color-muted)]">Tu possèdes :</span>
          <Owned have={gold} need={RUNE_CRAFT_COST.gold}>
            <UiIcon name="gold" size={11} color="var(--color-gold-soft)" />
          </Owned>
          <Owned have={larmes} need={RUNE_CRAFT_COST.material.qty}>
            <ResourceIcon resKey={RUNE_CRAFT_COST.material.key} />
          </Owned>
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {runeExtractableSets().map((s) => (
            <div key={s.id} className="flex items-start justify-between gap-2 rounded-lg border border-[var(--color-edge)] p-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--color-ink)]">{s.name}</span>
                <span className="block text-[10px] text-[var(--color-muted)]">{s.theme}</span>
                {/* L'effet EXACT, pas seulement le thème : c'est lui qu'on scelle. */}
                <span className="mt-1 block text-[11px] leading-snug text-[var(--color-arcane)]">
                  {describeSetEffect(s)}
                </span>
              </span>
              <button
                onClick={() => craft.mutate(s.id)}
                disabled={craft.isPending}
                className="btn shrink-0 text-xs"
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
            {awakened.map((h) => {
              const wornRune = ownedRunes.find((r) => r.id === h.runeId) ?? null;
              const runeSet = wornRune ? setById(wornRune.set_id) : null;
              // Redondance : le set scellé est DÉJÀ actif via l'équipement du héros
              // (2 pièces + classe autorisée) → la rune n'apporte rien.
              const redundant = Boolean(
                runeSet && h.sets.some((a) => a.set.id === runeSet.id && a.usable),
              );
              return (
                <div key={h.id} className="rounded-lg border border-[var(--color-gold-soft)]/30 bg-[var(--color-gold-soft)]/[0.05] p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm">
                      <ClassIcon classId={h.classId} size={20} />
                      <FavStar on={h.favorite} />{h.name} <span className="text-[10px] text-[var(--color-gold-soft)]">✦ éveillé</span>
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

                  {/* Ce que la rune apporte RÉELLEMENT à ce héros. */}
                  {runeSet && (
                    <p
                      className={`mt-1.5 text-[11px] leading-snug ${
                        redundant ? 'text-[var(--color-muted)] line-through' : 'text-[var(--color-arcane)]'
                      }`}
                    >
                      {describeSetEffect(runeSet)}
                    </p>
                  )}
                  {redundant && (
                    <p className="mt-1 flex items-start gap-1.5 rounded-md border border-[var(--color-ember)]/40 bg-[var(--color-ember)]/10 px-2 py-1 text-[11px] text-[var(--color-ember)]">
                      <UiIcon name="warning" size={12} color="currentColor" />
                      <span>
                        Effet <strong>déjà actif</strong> via les 2 pièces de « {runeSet!.name} » que
                        porte {h.name} : un même set ne se cumule pas avec sa rune. Mets-lui la rune
                        d'un <strong>autre</strong> set pour gagner un second effet.
                      </span>
                    </p>
                  )}
                </div>
              );
            })}
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
