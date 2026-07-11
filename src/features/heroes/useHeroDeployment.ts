import { useMemo } from 'react';
import { useDeployments, useMaps } from '@/features/maps/useMaps';
import { useActiveExpeditions, useExpeditionTypes } from '@/features/expedition/useExpedition';

/**
 * Où un héros est concrètement déployé (nom du lieu), pour l'afficher sur sa
 * carte / sa fiche. Complète {@link useHeroAvailability} qui, elle, ne renvoie
 * qu'un statut abstrait.
 *
 * `tone` :
 * - `busy` : farm auto ou expédition → occupé (ambre/rouge).
 * - `active` : assauts manuels → mobilisable (le serveur le réutilise).
 */
export type HeroDeployment = {
  label: string;
  tone: 'busy' | 'active';
};

export function useHeroDeployments(): Map<string, HeroDeployment> {
  const { data: deployments } = useDeployments();
  const { data: expeditions } = useActiveExpeditions();
  const { data: maps } = useMaps();
  const { data: expeditionTypes } = useExpeditionTypes();

  return useMemo(() => {
    // level_id → nom lisible « Carte — Niveau ».
    const levelName = new Map<string, string>();
    for (const m of maps ?? []) {
      for (const l of m.levels) levelName.set(l.id, `${m.name} — ${l.name}`);
    }
    const expName = new Map<string, string>();
    for (const t of expeditionTypes ?? []) expName.set(t.id, t.name);

    const m = new Map<string, HeroDeployment>();

    // Déploiements sur les cartes.
    for (const d of deployments ?? []) {
      const where = levelName.get(d.level_id) ?? 'une zone';
      const dep: HeroDeployment =
        d.mode === 'loop'
          ? { label: `En farm · ${where}`, tone: 'busy' }
          : { label: `Déployé · ${where}`, tone: 'active' };
      for (const h of d.hero_ids) {
        // En farm prime sur un simple déploiement d'assauts.
        if (!m.has(h) || dep.tone === 'busy') m.set(h, dep);
      }
    }

    // Les expéditions priment sur tout (activité la plus bloquante).
    for (const r of expeditions ?? []) {
      const where = expName.get(r.expedition_type_id) ?? 'une expédition';
      for (const h of r.hero_ids) m.set(h, { label: `En expédition · ${where}`, tone: 'busy' });
    }

    return m;
  }, [deployments, expeditions, maps, expeditionTypes]);
}
