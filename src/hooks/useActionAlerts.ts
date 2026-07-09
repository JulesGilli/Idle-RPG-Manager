import { useEffect, useState } from 'react';
import { useDungeonTypes, useDungeonCooldowns } from '@/features/dungeon/useDungeon';
import { useActiveExpeditions } from '@/features/expedition/useExpedition';
import { useTavernPool } from '@/features/heroes/useRecruit';
import { useProfile } from '@/hooks/useProfile';
import { dungeonCooldownRemaining } from '@shared/progression/dungeon';

/**
 * Signaux « une action est disponible ici » pour piquer une gommette rouge sur
 * les onglets et les cartes des hubs. Un signal ne s'allume que quand le joueur
 * a *quelque chose à faire maintenant* (pas juste « du contenu existe ») :
 * - `dungeon`   : un donjon DÉJÀ joué est ressorti de cooldown (prêt à relancer).
 * - `expedition`: une expédition en cours est terminée (butin à réclamer).
 * - `tavern`    : une recrue est disponible ET on a la place + l'or pour l'engager.
 *
 * `activities` / `village` agrègent ces signaux par onglet de navigation.
 */
export type ActionAlerts = {
  dungeon: boolean;
  expedition: boolean;
  tavern: boolean;
  activities: boolean;
  village: boolean;
};

export function useActionAlerts(): ActionAlerts {
  // Horloge grossière : les cooldowns/fins d'expé franchissent zéro sans event,
  // un tick périodique suffit à réévaluer les gommettes (précision non critique).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);

  const { data: dungeonTypes } = useDungeonTypes();
  const { data: cooldowns } = useDungeonCooldowns();
  const { data: expeditions } = useActiveExpeditions();
  const { data: tavern } = useTavernPool();
  const { data: profile } = useProfile();

  const dungeon = Boolean(
    dungeonTypes &&
      cooldowns &&
      dungeonTypes.some(
        (dj) => dj.id in cooldowns && dungeonCooldownRemaining(cooldowns[dj.id] ?? null, dj.tier, now) === 0,
      ),
  );

  const expedition = Boolean(expeditions?.some((r) => Date.parse(r.ends_at) <= now));

  const tavern_ = Boolean(
    tavern &&
      profile &&
      tavern.roster_size < tavern.max_roster &&
      tavern.candidates.some((c) => !c.claimed) &&
      profile.gold >= tavern.cost,
  );

  return {
    dungeon,
    expedition,
    tavern: tavern_,
    activities: dungeon || expedition,
    village: tavern_,
  };
}
