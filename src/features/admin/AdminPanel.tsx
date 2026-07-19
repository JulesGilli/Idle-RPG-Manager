import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UiIcon } from '@/components/synty/GameIcons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { BodyPortal } from '@/components/BodyPortal';
import { supabase } from '@/lib/supabaseClient';
import { useOnlinePlayers } from '@/features/chat/useChat';
import { useRelease } from '@/features/release/useRelease';
import { useAdminAction, useAdminPlayers } from './useAdmin';
import { AdminPlayers } from './AdminPlayers';
import { AdminItemGranter } from './AdminItemGranter';

const FALLBACK_CLASSES = ['guerrier', 'archer', 'mage', 'paladin', 'soigneur'];
const GRADES = ['S', 'A', 'B', 'C', 'D'] as const;

type Tab = 'players' | 'items' | 'resources' | 'codes' | 'global';
type Flash = { kind: 'ok' | 'err'; msg: string } | null;

const TABS: [Tab, string][] = [
  ['players', '👥 Joueurs'],
  ['items', '🎁 Objets'],
  ['resources', '💰 Ressources'],
  ['codes', '🎟️ Codes'],
  ['global', '🌍 Global'],
];

/** Panneau d'administration — rendu uniquement pour les admins (`app_config.admin_ids`, vrai verrou côté serveur). */
export function AdminPanel() {
  const { isAdmin } = useRelease();
  const action = useAdminAction();
  const online = useOnlinePlayers();

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('players');
  const [flash, setFlash] = useState<Flash>(null);
  const [confirmReroll, setConfirmReroll] = useState(false);

  // Cible commune à TOUTES les actions joueur, quel que soit l'onglet.
  const [player, setPlayer] = useState<string | null>(null);

  const [cls, setCls] = useState('mage');
  const [grade, setGrade] = useState<string>('B');
  const [gold, setGold] = useState('1000');
  const [xpAmount, setXpAmount] = useState('1000');
  const [resource, setResource] = useState('ecorce');
  const [matAmount, setMatAmount] = useState('50');

  const [code, setCode] = useState('');
  const [codeGold, setCodeGold] = useState('0');
  const [codeMat, setCodeMat] = useState('poussiere_etoile');
  const [codeMatQty, setCodeMatQty] = useState('30');
  const [codeMaxUses, setCodeMaxUses] = useState('');
  const [codeItem, setCodeItem] = useState(false);

  // Stats de base incluses : l'inspecteur en a besoin pour recalculer les stats
  // effectives d'un héros (base de classe + inné, puis niveau, puis équipement).
  const { data: classRows } = useQuery({
    queryKey: ['admin', 'hero_classes'],
    queryFn: async () => {
      const { data } = await supabase
        .from('hero_classes')
        .select('id, name, base_hp, base_atk, base_def, base_speed');
      return (data ?? []) as { id: string; name: string; base_hp: number; base_atk: number; base_def: number; base_speed: number }[];
    },
    staleTime: 5 * 60_000,
  });
  const classes = useMemo(
    () => (classRows && classRows.length ? classRows : FALLBACK_CLASSES.map((id) => ({ id, name: id }))),
    [classRows],
  );

  const { data: playerList } = useAdminPlayers(Boolean(isAdmin) && open);
  const onlineIds = useMemo(() => new Set(online.map((p) => p.id)), [online]);
  const targetName = useMemo(() => {
    if (!player) return null;
    const fromList = playerList?.players.find((p) => p.id === player)?.display_name;
    return fromList ?? online.find((p) => p.id === player)?.name ?? `${player.slice(0, 8)}…`;
  }, [player, playerList, online]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4200);
    return () => clearTimeout(t);
  }, [flash]);

  if (!isAdmin) return null;

  const busy = action.isPending;
  const needsTarget = !player;

  function run(body: Record<string, unknown>, ok: string) {
    setFlash(null);
    action.mutate(body, {
      onSuccess: () => setFlash({ kind: 'ok', msg: ok }),
      onError: (e) => setFlash({ kind: 'err', msg: e instanceof Error ? e.message : 'Erreur' }),
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

  const field =
    'w-full rounded-lg border border-[var(--color-edge)] bg-black/40 px-2.5 py-2 text-sm text-[var(--color-ink)] outline-none transition focus:border-[var(--color-arcane)]';
  const smallBtn = 'btn btn-primary shrink-0 px-3 py-2 text-xs';

  return (
    <BodyPortal>
      <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4">
        <div className="panel anim-pop flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden border-[var(--color-ember)]/50 shadow-2xl">
          {/* En-tête : la cible est épinglée ici, elle vaut pour tous les onglets */}
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-edge)] px-3 py-2.5">
            <span className="heading flex items-center gap-2 text-sm text-[var(--color-ember)]">
              <UiIcon name="power" size={15} color="currentColor" /> Panneau admin
            </span>
            <span className="ml-2 text-[11px] text-[var(--color-muted)]">
              Cible :{' '}
              {targetName ? (
                <strong className="text-[var(--color-ink)]">{targetName}</strong>
              ) : (
                <em className="not-italic text-[var(--color-ember)]">aucune</em>
              )}
            </span>
            {player && (
              <button
                onClick={() => setPlayer(null)}
                className="text-[11px] text-[var(--color-muted)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
              >
                désélectionner
              </button>
            )}
            <span className="ml-auto text-[11px] text-emerald-300">{online.length} en ligne</span>
            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-2 text-lg leading-none text-[var(--color-muted)] transition hover:text-[var(--color-ink)]"
              title="Fermer"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-edge)] bg-black/20 px-2 py-1.5">
            {TABS.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  tab === id
                    ? 'bg-[var(--color-arcane)]/25 text-[var(--color-ink)]'
                    : 'text-[var(--color-muted)] hover:text-[var(--color-ink)]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {flash && (
            <div
              className={`px-3 py-1.5 text-xs ${
                flash.kind === 'ok'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-[var(--color-ember)]/15 text-[var(--color-ember)]'
              }`}
            >
              {flash.msg}
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
            {tab === 'players' && (
              <AdminPlayers
                selected={player}
                onSelect={setPlayer}
                classes={classes}
                onlineIds={onlineIds}
              />
            )}

            {tab === 'items' && (
              <AdminItemGranter
                disabled={needsTarget}
                busy={busy}
                onGive={(body, label) => run({ ...body, player_id: player }, label)}
              />
            )}

            {tab === 'resources' && (
              <div className="grid gap-3 lg:grid-cols-2">
                <Section title="Or, XP, matériaux">
                  <Row label="Or (+/−)">
                    <input value={gold} onChange={(e) => setGold(e.target.value)} className={field} />
                    <button
                      disabled={busy || needsTarget}
                      className={smallBtn}
                      onClick={() =>
                        run(
                          { action: 'give_gold', player_id: player, amount: Number(gold) },
                          `${gold} or donné à ${targetName}`,
                        )
                      }
                    >
                      💰 Donner
                    </button>
                  </Row>
                  <Row label="XP (par héros)">
                    <input value={xpAmount} onChange={(e) => setXpAmount(e.target.value)} className={field} />
                    <button
                      disabled={busy || needsTarget}
                      className={smallBtn}
                      onClick={() =>
                        run(
                          { action: 'give_xp', player_id: player, amount: Number(xpAmount) },
                          `${xpAmount} XP donnés`,
                        )
                      }
                    >
                      ✨ Donner
                    </button>
                  </Row>
                  <Row label="Matériau (clé + quantité)">
                    <input value={resource} onChange={(e) => setResource(e.target.value)} className={field} placeholder="ex : ecorce" />
                    <input value={matAmount} onChange={(e) => setMatAmount(e.target.value)} className={`${field} w-20`} />
                    <button
                      disabled={busy || needsTarget}
                      className={smallBtn}
                      onClick={() =>
                        run(
                          { action: 'give_material', player_id: player, resource, amount: Number(matAmount) },
                          `${matAmount} ${resource} donnés`,
                        )
                      }
                    >
                      +
                    </button>
                  </Row>
                </Section>

                <Section title="Recrue & progression">
                  <div className="flex gap-2">
                    <select value={cls} onChange={(e) => setCls(e.target.value)} className={field}>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <select value={grade} onChange={(e) => setGrade(e.target.value)} className={`${field} w-20`}>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    disabled={busy || needsTarget}
                    className="btn btn-primary mt-2 w-full py-2 text-sm"
                    onClick={() =>
                      run(
                        { action: 'force_recruit', player_id: player, class_id: cls, grade },
                        `Recrue ${cls} ${grade} placée`,
                      )
                    }
                  >
                    ⭐ Placer dans sa taverne
                  </button>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      disabled={busy}
                      className="btn btn-ghost py-2 text-xs"
                      onClick={() => run({ action: 'set_arc', arc: 1, player_id: player ?? undefined }, `Arc 1 (${targetName ?? 'moi'})`)}
                    >
                      Arc 1
                    </button>
                    <button
                      disabled={busy}
                      className="btn btn-ghost py-2 text-xs text-[var(--color-ember)]"
                      onClick={() => run({ action: 'set_arc', arc: 2, player_id: player ?? undefined }, `Arc 2 (${targetName ?? 'moi'})`)}
                    >
                      🔴 Arc 2
                    </button>
                  </div>
                  <button
                    disabled={busy || needsTarget}
                    className="btn btn-ghost mt-2 w-full py-2 text-xs"
                    onClick={() => run({ action: 'reroll_player', player_id: player }, 'Taverne rerollée')}
                  >
                    🔄 Reroll sa taverne
                  </button>
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">Arc : sans cible, s'applique à toi.</p>
                </Section>
              </div>
            )}

            {tab === 'codes' && (
              <div className="max-w-lg">
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
                  <button
                    disabled={busy || !code.trim()}
                    className="btn btn-arcane mt-3 w-full py-2 text-sm"
                    onClick={() => {
                      const g = Math.max(0, Math.floor(Number(codeGold) || 0));
                      const qty = Math.max(0, Math.floor(Number(codeMatQty) || 0));
                      const materials = codeMat.trim() && qty > 0 ? [{ key: codeMat.trim(), qty }] : [];
                      run(
                        {
                          action: 'create_redeem_code',
                          code,
                          reward: { gold: g, materials, item: codeItem },
                          max_uses: codeMaxUses.trim() === '' ? null : Number(codeMaxUses),
                        },
                        `Code « ${code.trim().toUpperCase()} » créé`,
                      );
                    }}
                  >
                    🎟️ Créer le code
                  </button>
                </Section>
              </div>
            )}

            {tab === 'global' && (
              <div className="max-w-lg">
                <Section title="Actions globales">
                  <p className="mb-2 text-[11px] text-[var(--color-muted)]">
                    Touche TOUS les joueurs. À utiliser avec précaution.
                  </p>
                  <button
                    disabled={busy}
                    className="btn btn-ghost w-full py-2 text-sm text-[var(--color-ember)]"
                    onClick={() => setConfirmReroll(true)}
                  >
                    🔄 Reroll la taverne de tout le monde
                  </button>
                </Section>
              </div>
            )}
          </div>
        </div>
      </div>

      {confirmReroll && (
        <ConfirmDialog
          open
          danger
          title="Reroll global ?"
          message="La taverne de TOUS les joueurs sera renouvelée immédiatement."
          confirmLabel="Reroll tout"
          onConfirm={() => {
            setConfirmReroll(false);
            run({ action: 'reroll_all' }, 'Taverne de tout le monde rerollée');
          }}
          onCancel={() => setConfirmReroll(false)}
        />
      )}
    </BodyPortal>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-edge)] bg-black/25 p-2.5">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {title}
      </h4>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[11px] text-[var(--color-muted)]">{label}</div>
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
