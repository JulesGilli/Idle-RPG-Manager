import { useEffect, useMemo, useState } from 'react';
import { useDungeonTypes, useDungeonCooldowns } from '@/features/dungeon/useDungeon';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';
import { useTavernPool } from '@/features/heroes/useRecruit';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useProfile } from '@/hooks/useProfile';
import { useWorldBoss } from '@/features/worldboss/useWorldBoss';
import { useDummyStatus } from '@/features/pantin/useDailyDummy';
import { useArcEvent } from '@/features/arc/useArcEvent';
import { useAlertsStore } from '@/store/alertsStore';
import { dungeonCooldownRemaining } from '@shared/progression/dungeon';

/**
 * Gommettes « action dispo ». Deux familles de signaux :
 *
 * 1. Ceux qui s'éteignent une fois VUS (cf. alertsStore) — ils annoncent une
 *    nouveauté ponctuelle, et rester allumés après la visite serait du bruit :
 *    - `dungeon`   : un donjon déjà joué est ressorti de cooldown.
 *    - `expedition`: une expédition en cours est terminée.
 *    - `tavern`    : une recrue est dispo (place + or) et le pool du jour pas encore vu.
 *    - `library`   : au moins un point de compétence à dépenser.
 *
 * 2. Ceux qui s'éteignent une fois FAITS — ce sont des rendez-vous à consommer,
 *    pas des nouvelles. Les acquitter à la visite les éteindrait alors que le
 *    joueur n'a rien joué, et il oublierait sa frappe du jour :
 *    - `worldBoss` : boss de la semaine actif et pas encore frappé aujourd'hui.
 *    - `pantin`    : entraînement quotidien pas encore fait.
 *    - `arcBoss`   : event de boss d'arc en cours et frappe disponible.
 *
 * `activities` (hub Activités) = n'importe quel signal d'activité.
 * `village` (hub Village)      = tavern || library.
 */
export type ActionAlerts = {
  dungeon: boolean;
  expedition: boolean;
  tavern: boolean;
  library: boolean;
  worldBoss: boolean;
  pantin: boolean;
  arcBoss: boolean;
  activities: boolean;
  village: boolean;
};

/** Jetons « dispo maintenant » (avant filtrage par l'état vu). */
type AlertTokens = {
  dungeonIds: string[];
  expeditionIds: string[];
  tavernDay: string | null;
  libraryPoints: number;
};

function useAlertTokens(): AlertTokens {
  // Horloge grossière : les cooldowns/fins d'expé franchissent zéro sans event.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  const { data: dungeonTypes } = useDungeonTypes();
  const { data: cooldowns } = useDungeonCooldowns();
  const { data: expeditions } = useActiveExpeditions();
  const { data: tavern } = useTavernPool();
  const { data: heroes } = useHeroes();
  const { data: profile } = useProfile();

  const dungeonIds = useMemo(
    () =>
      (dungeonTypes ?? [])
        .filter(
          (dj) =>
            cooldowns &&
            dj.id in cooldowns.lastRunAt &&
            dungeonCooldownRemaining(cooldowns.lastRunAt[dj.id] ?? null, dj.tier, now) === 0,
        )
        .map((dj) => dj.id),
    [dungeonTypes, cooldowns, now],
  );

  const expeditionIds = useMemo(
    () => (expeditions ?? []).filter((r) => Date.parse(r.ends_at) <= now).map((r) => r.id),
    [expeditions, now],
  );

  const tavernAvailable = Boolean(
    tavern &&
      profile &&
      tavern.roster_size < tavern.max_roster &&
      tavern.candidates.some((c) => !c.claimed) &&
      profile.gold >= tavern.cost,
  );
  const tavernDay = tavernAvailable ? (tavern?.day ?? null) : null;

  const libraryPoints = (heroes ?? []).reduce((sum, h) => sum + (h.skillPoints ?? 0), 0);

  return { dungeonIds, expeditionIds, tavernDay, libraryPoints };
}

/**
 * Cadence de sondage des events depuis le hub. Ce hook vit dans `AppLayout`,
 * donc sur TOUS les écrans : à 2 min (la cadence de leurs écrans dédiés) on
 * quadruplerait l'egress pour un simple point rouge. 10 min suffisent — un
 * rendez-vous quotidien ne se périme pas à la minute, et jouer l'activité
 * invalide la query aussitôt, donc la gommette s'éteint sans attendre.
 */
const HUB_POLL_MS = 600_000;

export function useActionAlerts(): ActionAlerts {
  const { dungeonIds, expeditionIds, tavernDay, libraryPoints } = useAlertTokens();
  const seenDungeons = useAlertsStore((s) => s.seenDungeons);
  const seenExpeditions = useAlertsStore((s) => s.seenExpeditions);
  const seenTavernDay = useAlertsStore((s) => s.seenTavernDay);
  const seenLibraryMax = useAlertsStore((s) => s.seenLibraryMax);

  const dungeon = dungeonIds.some((id) => !seenDungeons.has(id));
  const expedition = expeditionIds.some((id) => !seenExpeditions.has(id));
  const tavern = tavernDay != null && tavernDay !== seenTavernDay;
  const library = libraryPoints > 0 && libraryPoints > seenLibraryMax;

  // --- Rendez-vous à consommer (pas d'acquittement à la visite) ---
  const wb = useWorldBoss(HUB_POLL_MS).state.data;
  const { data: dummy } = useDummyStatus();
  const arc = useArcEvent(HUB_POLL_MS).state.data;

  // `hittable` porte déjà les conditions du serveur (event actif, jour de
  // frappe…) : on ne les redevine pas ici, sinon la gommette mentirait dès que
  // les règles bougeraient côté serveur.
  const worldBoss = Boolean(wb?.active && wb?.hittable && !wb?.already_hit_today);
  const pantin = dummy ? !dummy.done_today : false;
  // `can_hit_now` implique déjà un event au statut 'active' côté serveur.
  const arcBoss = Boolean(arc?.can_hit_now);

  return {
    dungeon,
    expedition,
    tavern,
    library,
    worldBoss,
    pantin,
    arcBoss,
    activities: dungeon || expedition || worldBoss || pantin || arcBoss,
    village: tavern || library,
  };
}

/* ------------------------------------------------------------ ACQUITTEMENT --
 * Chaque écran concerné appelle son hook pour « marquer comme vu » ce qui est
 * dispo au moment de la visite. La gommette correspondante s'éteint alors, et ne
 * revient qu'avec un nouveau jeton (ou au refresh, l'état vu étant en mémoire).
 */

export function useMarkDungeonsSeen(): void {
  const { dungeonIds } = useAlertTokens();
  const ack = useAlertsStore((s) => s.ackDungeons);
  const key = dungeonIds.join(',');
  useEffect(() => {
    if (dungeonIds.length) ack(dungeonIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ack]);
}

export function useMarkExpeditionsSeen(): void {
  const { expeditionIds } = useAlertTokens();
  const ack = useAlertsStore((s) => s.ackExpeditions);
  const key = expeditionIds.join(',');
  useEffect(() => {
    if (expeditionIds.length) ack(expeditionIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ack]);
}

export function useMarkTavernSeen(): void {
  const { tavernDay } = useAlertTokens();
  const ack = useAlertsStore((s) => s.ackTavern);
  useEffect(() => {
    if (tavernDay) ack(tavernDay);
  }, [tavernDay, ack]);
}

export function useMarkLibrarySeen(): void {
  const { libraryPoints } = useAlertTokens();
  const ack = useAlertsStore((s) => s.ackLibrary);
  useEffect(() => {
    if (libraryPoints > 0) ack(libraryPoints);
  }, [libraryPoints, ack]);
}
