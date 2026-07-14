import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { UiIcon } from '@/components/synty/GameIcons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { supabase } from '@/lib/supabaseClient';
import { useOnlinePlayers } from '@/features/chat/useChat';
import { FORGE_BASES, FORGE_MATERIALS } from '@shared/progression/forge';
import { ADMIN_ID, useAdminAction } from './useAdmin';

const FALLBACK_CLASSES = ['guerrier', 'archer', 'mage', 'paladin', 'soigneur'];
const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;
const RARITIES = ['poor', 'common', 'uncommon', 'advanced', 'ultimate'] as const;

type Tab = 'player' | 'codes' | 'global';
type Flash = { kind: 'ok' | 'err'; msg: string } | null;

/** Panneau d'administration — rendu uniquement pour ADMIN_ID (vrai verrou côté serveur). */
export function AdminPanel() {
  const userId = useAuthStore((s) => s.user?.id);
  const action = useAdminAction();
  const online = useOnlinePlayers();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('player');
  const [flash, setFlash] = useState<Flash>(null);
  const [confirmReroll, setConfirmReroll] = useState(false);

  // Cible commune aux actions "joueur".
  const [player, setPlayer] = useState('');
  const [showUuid, setShowUuid] = useState(false);

  // Champs d'action.
  const [cls, setCls] = useState('mage');
  const [grade, setGrade] = useState<string>('B');
  const [gold, setGold] = useState('1000');
  const [xpAmount, setXpAmount] = useState('1000');
  const [resource, setResource] = useState('ecorce');
  const [matAmount, setMatAmount] = useState('50');
  const [itemSearch, setItemSearch] = useState('');
  const [giveBase, setGiveBase] = useState(FORGE_BASES[0]!.id);
  const [giveMaterial, setGiveMaterial] = useState(FORGE_MATERIALS[0]!.id);
  const [giveRarity, setGiveRarity] = useState<string>('ultimate');

  // Création de code.
  const [code, setCode] = useState('');
  const [codeGold, setCodeGold] = useState('0');
  const [codeMat, setCodeMat] = useState('poussiere_etoile');
  const [codeMatQty, setCodeMatQty] = useState('30');
  const [codeMaxUses, setCodeMaxUses] = useState('');
  const [codeItem, setCodeItem] = useState(false);

  // Classes tirées de la DB (inclut automatiquement les nouvelles classes).
  const { data: classRows } = useQuery({
    queryKey: ['admin', 'hero_classes'],
    queryFn: async () => {
      const { data } = await supabase.from('hero_classes').select('id, name');
      return (data ?? []) as { id: string; name: string }[];
    },
    staleTime: 5 * 60_000,
  });
  const classes = useMemo(
    () => (classRows && classRows.length ? classRows : FALLBACK_CLASSES.map((id) => ({ id, name: id }))),
    [classRows],
  );

  const filteredBases = useMemo(
    () => FORGE_BASES.filter((b) => b.label.toLowerCase().includes(itemSearch.trim().toLowerCase())),
    [itemSearch],
  );

  // Auto-effacement du retour.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  if (userId !== ADMIN_ID) return null;

  const busy = action.isPending;
  const targetName =
    online.find((p) => p.id === player)?.name ?? (player ? `${player.slice(0, 8)}…` : null);

  function run(body: Record<string, unknown>, ok: string) {
    setFlash(null);
    action.mutate(body, {
      onSuccess: () => setFlash({ kind: 'ok', msg: ok }),
      onError: (e) => setFlash({ kind: 'err', msg: e instanceof Error ? e.message : 'Erreur' }),
    });
  }

  /* ---- Launcher replié ---- */
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

  const field =
    'w-full rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)]';
  const smallBtn = 'btn btn-primary shrink-0 px-3 py-2 text-xs';
  const needsTarget = !player;

  return (
    <>
      <div className="panel fixed bottom-20 left-3 z-40 flex max-h-[78vh] w-[min(94vw,23rem)] flex-col overflow-hidden border-[var(--color-ember)]/50 shadow-2xl anim-slide sm:bottom-4 sm:left-4">
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-[var(--color-edge)] px-3 py-2.5">
          <span className="heading flex items-center gap-2 text-sm text-[var(--color-ember)]">
            <UiIcon name="power" size={15} color="currentColor" /> Panneau admin
          </span>
          <button
            onClick={() => setOpen(false)}
            className="rounded-md px-1.5 text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
            title="Fermer"
          >
            ▾
          </button>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 border-b border-[var(--color-edge)] bg-black/20 px-2 py-1.5">
          {([
            ['player', '👤 Joueur'],
            ['codes', '🎟️ Codes'],
            ['global', '🌍 Global'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${
                tab === id
                  ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 text-sm">
          {/* ============================== JOUEUR ============================== */}
          {tab === 'player' && (
            <>
              {/* Cible épinglée */}
              <section className="rounded-xl border border-[var(--color-edge)] bg-black/25 p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    Cible
                  </span>
                  {targetName ? (
                    <span className="chip bg-[var(--color-arcane)]/20 text-[var(--color-ink)]">
                      {targetName}
                    </span>
                  ) : (
                    <span className="text-[11px] text-[var(--color-ember)]">aucune</span>
                  )}
                </div>
                <select
                  value={online.some((p) => p.id === player) ? player : ''}
                  onChange={(e) => setPlayer(e.target.value)}
                  className={field}
                >
                  <option value="">— Joueurs en ligne ({online.length}) —</option>
                  {online.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowUuid((v) => !v)}
                  className="mt-1.5 text-[11px] text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
                >
                  {showUuid ? '– masquer' : '+ cibler par UUID (hors ligne)'}
                </button>
                {showUuid && (
                  <input
                    value={player}
                    onChange={(e) => setPlayer(e.target.value)}
                    placeholder="colle un uuid de joueur"
                    className={`${field} mt-1.5`}
                  />
                )}
              </section>

              {/* Ressources */}
              <Section title="Ressources">
                <Row label="Or (+/−)">
                  <input value={gold} onChange={(e) => setGold(e.target.value)} className={field} />
                  <button disabled={busy || needsTarget} className={smallBtn}
                    onClick={() => run({ action: 'give_gold', player_id: player, amount: Number(gold) }, `${gold} or donné à ${targetName}`)}>
                    💰 Donner
                  </button>
                </Row>
                <Row label="XP (par héros)">
                  <input value={xpAmount} onChange={(e) => setXpAmount(e.target.value)} className={field} />
                  <button disabled={busy || needsTarget} className={smallBtn}
                    onClick={() => run({ action: 'give_xp', player_id: player, amount: Number(xpAmount) }, `${xpAmount} XP donnés`)}>
                    ✨ Donner
                  </button>
                </Row>
                <Row label="Matériau (clé + quantité)">
                  <input value={resource} onChange={(e) => setResource(e.target.value)} className={field} placeholder="ex : ecorce" />
                  <input value={matAmount} onChange={(e) => setMatAmount(e.target.value)} className={`${field} w-20`} />
                  <button disabled={busy || needsTarget} className={smallBtn}
                    onClick={() => run({ action: 'give_material', player_id: player, resource, amount: Number(matAmount) }, `${matAmount} ${resource} donnés`)}>
                    +
                  </button>
                </Row>
              </Section>

              {/* Objet */}
              <Section title="Offrir un objet">
                <input value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} placeholder="🔍 rechercher un modèle…" className={`${field} mb-2`} />
                <select value={giveBase} onChange={(e) => setGiveBase(e.target.value)} className={`${field} mb-2`}>
                  {filteredBases.map((b) => (
                    <option key={b.id} value={b.id}>{b.label} ({b.itemType === 'weapon' ? 'arme' : 'armure'})</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select value={giveMaterial} onChange={(e) => setGiveMaterial(e.target.value)} className={field}>
                    {FORGE_MATERIALS.map((m) => (
                      <option key={m.id} value={m.id}>Z{m.zone} · {m.label}</option>
                    ))}
                  </select>
                  <select value={giveRarity} onChange={(e) => setGiveRarity(e.target.value)} className={`${field} w-28`}>
                    {RARITIES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button disabled={busy || needsTarget} className="btn btn-arcane mt-2 w-full py-2 text-sm"
                  onClick={() => run({ action: 'give_item', player_id: player, base_id: giveBase, material_id: giveMaterial, rarity: giveRarity }, 'Objet offert')}>
                  🎁 Offrir l'objet
                </button>
              </Section>

              {/* Recrue */}
              <Section title="Forcer une recrue">
                <div className="flex gap-2">
                  <select value={cls} onChange={(e) => setCls(e.target.value)} className={field}>
                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`${field} w-20`}>
                    {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <button disabled={busy || needsTarget} className="btn btn-primary mt-2 w-full py-2 text-sm"
                  onClick={() => run({ action: 'force_recruit', player_id: player, class_id: cls, grade }, `Recrue ${cls} ${grade} placée`)}>
                  ⭐ Placer dans sa taverne
                </button>
              </Section>

              {/* Divers */}
              <Section title="Progression & taverne">
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy} className="btn btn-ghost py-2 text-xs"
                    onClick={() => run({ action: 'set_arc', arc: 1, player_id: player || undefined }, `Arc 1 (${targetName ?? 'moi'})`)}>
                    Arc 1
                  </button>
                  <button disabled={busy} className="btn btn-ghost py-2 text-xs text-[var(--color-ember)]"
                    onClick={() => run({ action: 'set_arc', arc: 2, player_id: player || undefined }, `Arc 2 (${targetName ?? 'moi'})`)}>
                    🔴 Arc 2
                  </button>
                </div>
                <button disabled={busy || needsTarget} className="btn btn-ghost mt-2 w-full py-2 text-xs"
                  onClick={() => run({ action: 'reroll_player', player_id: player }, 'Taverne rerollée')}>
                  🔄 Reroll sa taverne
                </button>
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">Arc : sans cible, s'applique à toi.</p>
              </Section>
            </>
          )}

          {/* ============================== CODES ============================== */}
          {tab === 'codes' && (
            <Section title="Créer un code de récompense">
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="code (ex : WELCOME2026)" className={`${field} uppercase`} />
              <Row label="Or / usages max (∞ si vide)">
                <input value={codeGold} onChange={(e) => setCodeGold(e.target.value)} className={field} />
                <input value={codeMaxUses} onChange={(e) => setCodeMaxUses(e.target.value)} placeholder="∞" className={`${field} w-20`} />
              </Row>
              <Row label="Matériau (clé + quantité)">
                <input value={codeMat} onChange={(e) => setCodeMat(e.target.value)} className={field} />
                <input value={codeMatQty} onChange={(e) => setCodeMatQty(e.target.value)} className={`${field} w-20`} />
              </Row>
              <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink)]">
                <input type="checkbox" checked={codeItem} onChange={(e) => setCodeItem(e.target.checked)} />
                Inclure un objet ultime de zone 10
              </label>
              <button disabled={busy || !code.trim()} className="btn btn-arcane mt-3 w-full py-2 text-sm"
                onClick={() => {
                  const g = Math.max(0, Math.floor(Number(codeGold) || 0));
                  const qty = Math.max(0, Math.floor(Number(codeMatQty) || 0));
                  const materials = codeMat.trim() && qty > 0 ? [{ key: codeMat.trim(), qty }] : [];
                  run({ action: 'create_redeem_code', code, reward: { gold: g, materials, item: codeItem }, max_uses: codeMaxUses.trim() === '' ? null : Number(codeMaxUses) }, `Code « ${code.trim().toUpperCase()} » créé`);
                }}>
                🎟️ Créer le code
              </button>
            </Section>
          )}

          {/* ============================== GLOBAL ============================== */}
          {tab === 'global' && (
            <Section title="Actions globales">
              <p className="mb-2 text-[11px] text-[var(--color-muted)]">Touche TOUS les joueurs. À utiliser avec précaution.</p>
              <button disabled={busy} className="btn btn-ghost w-full py-2 text-sm text-[var(--color-ember)]"
                onClick={() => setConfirmReroll(true)}>
                🔄 Reroll la taverne de tout le monde
              </button>
            </Section>
          )}

          {/* Retour */}
          {flash && (
            <div className={`anim-pop rounded-lg border p-2.5 text-xs ${
              flash.kind === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                : 'border-[var(--color-ember)]/50 bg-[var(--color-ember)]/10 text-[var(--color-ember)]'
            }`}>
              {flash.kind === 'ok' ? '✓ ' : '✗ '}{flash.msg}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmReroll}
        danger
        busy={busy}
        title="Reroll global"
        message="Rerroll la taverne de TOUS les joueurs ? Action immédiate et irréversible."
        confirmLabel="Reroll tout le monde"
        onCancel={() => setConfirmReroll(false)}
        onConfirm={() => {
          setConfirmReroll(false);
          run({ action: 'reroll_all' }, 'Taverne de tous les joueurs rerollée');
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------- sous-blocs -- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-edge)] bg-black/20 p-2.5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">{title}</div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <span className="mb-1 block text-[10px] text-[var(--color-muted)]">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
