import { useMemo, useState } from 'react';
import { useItems, type ItemRow } from '@/features/heroes/useItems';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useResources } from '@/hooks/useResources';
import { useProfile } from '@/hooks/useProfile';
import { rarityColor } from '@/lib/gameUi';
import { UPGRADE_MAX, TYPE_BONUS_LABEL, type Recipe } from '@shared/progression/forge';
import {
  baseIdOfName,
  weaponTypeBonus,
  blessingCost,
  blessedTypeBonusPct,
  validateBless,
  BLESSING_MAX,
} from '@shared/progression/blessing';
import { useForge } from '@/features/forge/useForge';
import { ResourceIcon } from '@/components/synty/ResourceIcon';
import { UiIcon, EquipmentIcon } from '@/components/synty/GameIcons';
import { BlessingStars } from '@/components/ItemStars';

/**
 * L'ATELIER DE L'ORATOIRE — la bénédiction, et rien d'autre.
 *
 * Elle vivait en bas de l'atelier de renforcement, à la Forge : un encadré rouge
 * sous les boutons, qui n'apparaissait que sur les armes. Deux voies OPPOSÉES au
 * même endroit — l'une monte les stats brutes, l'autre les gèle pour amplifier le
 * type — et la seconde ne se voyait qu'en fouillant. Elle a son lieu.
 *
 * Le choix est irréversible (une arme bénie ne se renforce plus) : cet écran doit
 * donc MONTRER ce qu'on gagne et ce qu'on perd, pas seulement un bouton.
 */
export function BlessStudio() {
  const { data: items } = useItems();
  const { data: heroes } = useHeroes();
  const { data: resources } = useResources();
  const { data: profile } = useProfile();
  const { bless } = useForge();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const equippedBy = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of heroes ?? []) {
      for (const it of [h.weapon, h.armor, h.jewel, h.relic]) if (it) map.set(it.id, h.name);
    }
    return map;
  }, [heroes]);

  // L'Oratoire ne montre QUE les armes réellement consacrables maintenant : une
  // arme à +0 de renfort ne peut pas l'être (la bénédiction est plafonnée par le
  // renforcement), une arme au plafond non plus. Les lister pour les barrer
  // ensuite, c'est faire chercher au joueur.
  const weapons = (items ?? []).filter(
    (i) => i.item_type === 'weapon' && weaponTypeBonus(baseIdOfName(i.name) ?? '') != null,
  );
  const list = weapons.filter(
    (i) => validateBless(i.name, i.item_type, i.upgrade_level, i.blessing_level ?? 0).ok,
  );
  // On ne les escamote pas en silence : le joueur doit savoir qu'elles existent
  // et POURQUOI elles ne sont pas là, sinon il croit les avoir perdues.
  const hidden = weapons.length - list.length;
  // Le détail se résout sur TOUTES les armes, pas sur la liste filtrée : bénir
  // peut faire sortir l'arme de la liste (bénédiction rattrape le renforcement),
  // et le panneau ne doit pas se vider sous le nez du joueur avec son résultat.
  const selected = weapons.find((i) => i.id === selectedId) ?? null;
  const gold = profile?.gold ?? 0;
  const res = resources ?? {};

  const canAfford = (r: Recipe): boolean =>
    gold >= r.gold && r.materials.every((m) => (res[m.key] ?? 0) >= m.qty);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="panel max-h-[60vh] overflow-y-auto p-2">
        {list.length === 0 && (
          <p className="p-3 text-sm text-[var(--color-muted)]">
            {weapons.length === 0
              ? 'Aucune arme. Forge-en une — toutes portent un amplificateur de type.'
              : 'Aucune arme consacrable pour l’instant : renforce-les d’abord à la Forge (la bénédiction est plafonnée par le renforcement).'}
          </p>
        )}
        {list.map((item) => {
          const tb = weaponTypeBonus(baseIdOfName(item.name) ?? '');
          return (
            <button
              key={item.id}
              onClick={() => {
                setSelectedId(item.id);
                setFeedback(null);
              }}
              className={`mb-1 flex w-full flex-col gap-1 rounded-lg px-3 py-2 text-left text-sm transition ${
                selectedId === item.id ? 'bg-[#fb7185]/15' : 'hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2">
                  <EquipmentIcon item={item} size={16} color="var(--color-muted)" />
                  <span className="truncate" style={{ color: rarityColor(item.rarity) }}>
                    {item.name}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-[var(--color-muted)]">
                  +{item.upgrade_level}
                </span>
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <BlessingStars level={item.blessing_level} size={11} />
                  {tb && (
                    <span className="text-[10px] text-[var(--color-muted)]">{TYPE_BONUS_LABEL[tb.kind]}</span>
                  )}
                </span>
                {equippedBy.get(item.id) && (
                  <span className="inline-flex items-center gap-1 truncate text-[10px] font-semibold text-[var(--color-gold-soft)]">
                    <UiIcon name="squad" size={10} color="currentColor" />
                    {equippedBy.get(item.id)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        {hidden > 0 && (
          <p className="border-t border-[var(--color-edge)] px-3 pb-1 pt-2 text-[10px] text-[var(--color-muted)]/80">
            {hidden} arme{hidden > 1 ? 's' : ''} non listée{hidden > 1 ? 's' : ''} : bénédiction déjà au
            plafond, ou renforcement trop bas pour la porter.
          </p>
        )}
      </div>

      <div className="panel p-4">
        {!selected ? (
          <p className="text-sm text-[var(--color-muted)]">Choisis une arme à consacrer.</p>
        ) : (
          <BlessDetail
            item={selected}
            wearer={equippedBy.get(selected.id)}
            gold={gold}
            res={res}
            canAfford={canAfford}
            busy={bless.isPending}
            feedback={feedback}
            onBless={() => {
              setFeedback(null);
              bless.mutate(selected.id, {
                onSuccess: (r) => setFeedback(`✦ Consacrée — bénédiction +${r.blessing_level}`),
                onError: (e) => setFeedback(e instanceof Error ? e.message : 'Erreur'),
              });
            }}
          />
        )}
      </div>
    </div>
  );
}

function BlessDetail({
  item,
  wearer,
  gold,
  res,
  canAfford,
  busy,
  feedback,
  onBless,
}: {
  item: ItemRow;
  wearer: string | undefined;
  gold: number;
  res: Record<string, number>;
  canAfford: (r: Recipe) => boolean;
  busy: boolean;
  feedback: string | null;
  onBless: () => void;
}) {
  const level = item.blessing_level ?? 0;
  const tb = weaponTypeBonus(baseIdOfName(item.name) ?? '');
  const check = validateBless(item.name, item.item_type, item.upgrade_level, level);
  const recipe = blessingCost(level);
  const affordable = canAfford(recipe);

  const now = tb ? blessedTypeBonusPct(tb.pct, level) : 0;
  const next = tb ? blessedTypeBonusPct(tb.pct, level + 1) : 0;
  const pct = (v: number): string => `${Math.round(v * 100)}%`;

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-lg font-semibold" style={{ color: rarityColor(item.rarity) }}>
          {item.name}
        </span>
        <span className="chip bg-white/5 text-[var(--color-muted)]">Renfort +{item.upgrade_level}/{UPGRADE_MAX}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <BlessingStars level={level} size={14} />
        <span className="text-[10px] tabular-nums text-[var(--color-muted)]">
          +{level}/{BLESSING_MAX}
        </span>
        {wearer && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-gold-soft)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-gold-soft)]">
            <UiIcon name="squad" size={11} color="currentColor" /> Équipée par {wearer}
          </span>
        )}
      </div>

      {/* Ce que la bénédiction FAIT — un % de dégâts de type, pas des stats brutes. */}
      {tb && (
        <div className="mt-4 rounded-lg border border-[#fb7185]/25 bg-[#fb7185]/[0.06] p-3">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-[var(--color-muted)]">Dégâts {TYPE_BONUS_LABEL[tb.kind].toLowerCase()}</span>
            {check.ok ? (
              <span className="flex items-center gap-1.5 font-display font-semibold">
                <span className="text-[var(--color-ink)]">+{pct(now)}</span>
                <span className="text-[#fb7185]">→ +{pct(next)}</span>
              </span>
            ) : (
              <span className="font-display font-semibold text-[var(--color-ink)]">+{pct(now)}</span>
            )}
          </div>
          <p className="text-[10px] text-[var(--color-muted)]/80">
            La bénédiction n'ajoute aucune stat brute : elle amplifie ce que l'arme fait déjà.
          </p>
        </div>
      )}

      {/* Le prix à payer — l'irréversibilité se dit AVANT, pas après. */}
      {level === 0 && check.ok && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--color-ember)]/30 bg-[var(--color-ember)]/[0.07] p-2.5 text-[11px] text-[var(--color-ember)]">
          <UiIcon name="lock" size={13} color="currentColor" />
          <span>
            Une fois consacrée, cette arme ne pourra <strong>plus jamais</strong> être renforcée. Monte-la au
            renfort voulu d'abord — la bénédiction est plafonnée par lui.
          </span>
        </p>
      )}

      {check.ok ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--color-edge)] pt-3 text-[11px]">
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Offrande</span>
            <span
              className={`inline-flex items-center gap-1 rounded px-1 ${
                gold >= recipe.gold
                  ? 'text-[var(--color-ink)]'
                  : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
              }`}
            >
              <UiIcon name="gold" size={12} /> {recipe.gold}
            </span>
            {recipe.materials.map((m) => {
              const have = res[m.key] ?? 0;
              const ok = have >= m.qty;
              return (
                <span
                  key={m.key}
                  title={ok ? undefined : `Il te manque ${m.qty - have}`}
                  className={`inline-flex items-center gap-1 rounded px-1 ${
                    ok
                      ? 'text-[var(--color-ink)]'
                      : 'bg-[var(--color-ember)]/15 font-semibold text-[var(--color-ember)] ring-1 ring-[var(--color-ember)]/40'
                  }`}
                >
                  <ResourceIcon resKey={m.key} />{' '}
                  <span className="tabular-nums">
                    {have}/{m.qty}
                  </span>
                </span>
              );
            })}
          </div>
          <button
            onClick={onBless}
            disabled={busy || !affordable}
            className="btn mt-3 w-full text-sm font-semibold"
            style={{ background: affordable ? '#be123c' : undefined, color: affordable ? 'white' : undefined }}
          >
            {busy ? 'Consécration…' : level === 0 ? 'Consacrer l’arme' : `Bénir · +${level} → +${level + 1}`}
          </button>
        </>
      ) : (
        <p className="mt-4 rounded-lg border border-[var(--color-edge)] bg-black/20 p-3 text-xs text-[var(--color-muted)]">
          {check.reason}
        </p>
      )}

      {feedback && <p className="mt-3 text-center text-sm text-[#fb7185]">{feedback}</p>}
    </div>
  );
}
