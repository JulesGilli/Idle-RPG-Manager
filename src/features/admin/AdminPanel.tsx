import { useMemo, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { UiIcon } from '@/components/synty/GameIcons';
import { useOnlinePlayers } from '@/features/chat/useChat';
import { FORGE_BASES, FORGE_MATERIALS } from '@shared/progression/forge';
import { ADMIN_ID, useAdminAction } from './useAdmin';

const CLASSES = ['guerrier', 'archer', 'mage', 'paladin', 'soigneur'] as const;
const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
const RARITIES = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;

/** Panneau d'administration — rendu uniquement pour ADMIN_ID (gate serveur en plus). */
export function AdminPanel() {
  const userId = useAuthStore((s) => s.user?.id);
  const [open, setOpen] = useState(false);
  const action = useAdminAction();

  const [player, setPlayer] = useState('');
  const [cls, setCls] = useState<string>('mage');
  const [grade, setGrade] = useState<string>('B');
  const [gold, setGold] = useState('1000');
  const [resource, setResource] = useState('ecorce');
  const [matAmount, setMatAmount] = useState('50');
  const [result, setResult] = useState<string | null>(null);

  // Création de code redeem.
  const [code, setCode] = useState('');
  const [codeGold, setCodeGold] = useState('0');
  const [codeMat, setCodeMat] = useState('poussiere_etoile');
  const [codeMatQty, setCodeMatQty] = useState('30');
  const [codeItem, setCodeItem] = useState(false);
  const [codeMaxUses, setCodeMaxUses] = useState('');

  // Offrir un objet + XP.
  const [itemSearch, setItemSearch] = useState('');
  const [giveBase, setGiveBase] = useState(FORGE_BASES[0]!.id);
  const [giveMaterial, setGiveMaterial] = useState(FORGE_MATERIALS[0]!.id);
  const [giveRarity, setGiveRarity] = useState<string>('ultimate');
  const [xpAmount, setXpAmount] = useState('1000');

  const online = useOnlinePlayers();
  const filteredBases = useMemo(
    () => FORGE_BASES.filter((b) => b.label.toLowerCase().includes(itemSearch.trim().toLowerCase())),
    [itemSearch],
  );

  if (userId !== ADMIN_ID) return null;

  function run(body: Record<string, unknown>, label: string) {
    setResult(null);
    action.mutate(body, {
      onSuccess: (d) => setResult(`✓ ${label} — ${JSON.stringify(d)}`),
      onError: (e) => setResult(`✗ ${e instanceof Error ? e.message : 'Erreur'}`),
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-3 z-40 flex items-center gap-2 rounded-full border border-[var(--color-ember)]/50 bg-[var(--color-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-ember)] shadow-lg transition hover:border-[var(--color-ember)] sm:bottom-4 sm:left-4"
        title="Panneau admin"
      >
        <UiIcon name="power" size={14} color="currentColor" /> Admin
      </button>
    );
  }

  const busy = action.isPending;
  const input =
    'w-full rounded-md border border-[var(--color-edge)] bg-black/40 px-2 py-1.5 text-sm text-[var(--color-ink)] outline-none focus:border-[var(--color-arcane)]';
  const btn = 'rounded-md bg-[var(--color-arcane)]/25 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-ink)] transition hover:bg-[var(--color-arcane)]/40 disabled:opacity-40';

  return (
    <div className="fixed bottom-20 left-3 z-40 flex max-h-[75vh] w-[min(92vw,22rem)] flex-col overflow-hidden rounded-xl border border-[var(--color-ember)]/50 bg-[var(--color-panel)] shadow-2xl sm:bottom-4 sm:left-4">
      <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--color-ember)]">
          <UiIcon name="power" size={14} color="currentColor" /> Panneau admin
        </span>
        <button onClick={() => setOpen(false)} className="text-[var(--color-muted)] hover:text-[var(--color-ink)]">
          ▾
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
        {/* Reroll global */}
        <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
          <div className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">Tavernes</div>
          <button disabled={busy} onClick={() => run({ action: 'reroll_all' }, 'Reroll tous')} className={`${btn} w-full`}>
            🔄 Reroll la taverne de TOUS les joueurs
          </button>
        </section>

        {/* Cible : id joueur */}
        <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
          <div className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">
            Joueur ciblé
          </div>
          <select
            value={online.some((p) => p.id === player) ? player : ''}
            onChange={(e) => setPlayer(e.target.value)}
            className={`${input} mb-1.5`}
          >
            <option value="">— Joueurs en ligne ({online.length}) —</option>
            {online.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            placeholder="ou colle un uuid de joueur"
            className={input}
          />

          <button
            disabled={busy || !player}
            onClick={() => run({ action: 'reroll_player', player_id: player }, 'Reroll joueur')}
            className={`${btn} mt-2 w-full`}
          >
            🔄 Reroll sa taverne
          </button>

          {/* Forcer une recrue */}
          <div className="mt-3 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">Classe</span>
              <select value={cls} onChange={(e) => setCls(e.target.value)} className={input}>
                {CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-20">
              <span className="text-[10px] text-[var(--color-muted)]">Grade</span>
              <select value={grade} onChange={(e) => setGrade(e.target.value)} className={input}>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            disabled={busy || !player}
            onClick={() =>
              run({ action: 'force_recruit', player_id: player, class_id: cls, grade }, 'Recrue forcée')
            }
            className={`${btn} mt-2 w-full`}
          >
            ⭐ Forcer un(e) {cls} {grade} dans sa taverne
          </button>

          {/* Or */}
          <div className="mt-3 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">Or (+/−)</span>
              <input value={gold} onChange={(e) => setGold(e.target.value)} className={input} />
            </label>
            <button
              disabled={busy || !player}
              onClick={() => run({ action: 'give_gold', player_id: player, amount: Number(gold) }, 'Or')}
              className={`${btn} mb-0.5`}
            >
              💰 Donner
            </button>
          </div>

          {/* Matériau */}
          <div className="mt-3 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">Matériau (clé)</span>
              <input value={resource} onChange={(e) => setResource(e.target.value)} className={input} />
            </label>
            <label className="w-20">
              <span className="text-[10px] text-[var(--color-muted)]">Qté</span>
              <input value={matAmount} onChange={(e) => setMatAmount(e.target.value)} className={input} />
            </label>
            <button
              disabled={busy || !player}
              onClick={() =>
                run(
                  { action: 'give_material', player_id: player, resource, amount: Number(matAmount) },
                  'Matériau',
                )
              }
              className={`${btn} mb-0.5`}
            >
              +
            </button>
          </div>

          {/* Changer d'arc (test) : débloque + saute à l'arc choisi. Joueur vide = soi. */}
          <div className="mt-3 flex items-end gap-2">
            <span className="flex-1 text-[10px] text-[var(--color-muted)]">
              Arc (débloque + bascule le joueur ciblé, ou soi si vide)
            </span>
            <button
              disabled={busy}
              onClick={() => run({ action: 'set_arc', arc: 1, player_id: player || undefined }, 'Arc 1')}
              className={`${btn} mb-0.5`}
            >
              Arc 1
            </button>
            <button
              disabled={busy}
              onClick={() => run({ action: 'set_arc', arc: 2, player_id: player || undefined }, 'Arc 2')}
              className={`${btn} mb-0.5`}
            >
              🔴 Arc 2
            </button>
          </div>

          {/* Donner de l'XP */}
          <div className="mt-3 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">XP / héros</span>
              <input value={xpAmount} onChange={(e) => setXpAmount(e.target.value)} className={input} />
            </label>
            <button
              disabled={busy || !player}
              onClick={() => run({ action: 'give_xp', player_id: player, amount: Number(xpAmount) }, 'XP')}
              className={`${btn} mb-0.5`}
            >
              ✨ XP
            </button>
          </div>

          {/* Offrir un objet (recherche) */}
          <div className="mt-3 border-t border-[var(--color-edge)] pt-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
              Offrir un objet
            </div>
            <input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="🔍 rechercher un modèle…"
              className={`${input} mb-1.5`}
            />
            <select value={giveBase} onChange={(e) => setGiveBase(e.target.value)} className={`${input} mb-1.5`}>
              {filteredBases.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label} ({b.itemType === 'weapon' ? 'arme' : 'armure'})
                </option>
              ))}
            </select>
            <div className="flex items-end gap-2">
              <label className="flex-1">
                <span className="text-[10px] text-[var(--color-muted)]">Zone</span>
                <select value={giveMaterial} onChange={(e) => setGiveMaterial(e.target.value)} className={input}>
                  {FORGE_MATERIALS.map((m) => (
                    <option key={m.id} value={m.id}>
                      Z{m.zone} · {m.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="w-28">
                <span className="text-[10px] text-[var(--color-muted)]">Rareté</span>
                <select value={giveRarity} onChange={(e) => setGiveRarity(e.target.value)} className={input}>
                  {RARITIES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              disabled={busy || !player}
              onClick={() =>
                run(
                  {
                    action: 'give_item',
                    player_id: player,
                    base_id: giveBase,
                    material_id: giveMaterial,
                    rarity: giveRarity,
                  },
                  'Objet offert',
                )
              }
              className={`${btn} mt-2 w-full`}
            >
              🎁 Offrir l'objet
            </button>
          </div>
        </section>

        {/* Codes de récompense */}
        <section className="rounded-lg border border-[var(--color-edge)] bg-black/20 p-2.5">
          <div className="mb-1.5 text-xs font-semibold text-[var(--color-muted)]">
            Créer un code de récompense
          </div>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="code (ex : WELCOME2026)"
            className={input}
          />
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">Or</span>
              <input value={codeGold} onChange={(e) => setCodeGold(e.target.value)} className={input} />
            </label>
            <label className="w-24">
              <span className="text-[10px] text-[var(--color-muted)]">Usages max</span>
              <input
                value={codeMaxUses}
                onChange={(e) => setCodeMaxUses(e.target.value)}
                placeholder="∞"
                className={input}
              />
            </label>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <label className="flex-1">
              <span className="text-[10px] text-[var(--color-muted)]">Matériau (clé)</span>
              <input value={codeMat} onChange={(e) => setCodeMat(e.target.value)} className={input} />
            </label>
            <label className="w-20">
              <span className="text-[10px] text-[var(--color-muted)]">Qté</span>
              <input value={codeMatQty} onChange={(e) => setCodeMatQty(e.target.value)} className={input} />
            </label>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink)]">
            <input type="checkbox" checked={codeItem} onChange={(e) => setCodeItem(e.target.checked)} />
            Objet ultime de zone 10
          </label>
          <button
            disabled={busy || !code.trim()}
            onClick={() => {
              const gold = Math.max(0, Math.floor(Number(codeGold) || 0));
              const qty = Math.max(0, Math.floor(Number(codeMatQty) || 0));
              const materials = codeMat.trim() && qty > 0 ? [{ key: codeMat.trim(), qty }] : [];
              run(
                {
                  action: 'create_redeem_code',
                  code,
                  reward: { gold, materials, item: codeItem },
                  max_uses: codeMaxUses.trim() === '' ? null : Number(codeMaxUses),
                },
                'Code créé',
              );
            }}
            className={`${btn} mt-2 w-full`}
          >
            🎟️ Créer le code
          </button>
        </section>

        {result && (
          <p className="break-words rounded-md bg-black/30 p-2 text-[11px] text-[var(--color-ink)]/85">
            {result}
          </p>
        )}
      </div>
    </div>
  );
}
