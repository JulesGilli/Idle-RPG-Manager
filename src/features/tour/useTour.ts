import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useProfile } from '@/hooks/useProfile';
import { useHeroes } from '@/features/heroes/useHeroes';
import { useDeployments } from '@/features/maps/useMaps';
import { useItems } from '@/features/heroes/useItems';
import { useResources } from '@/hooks/useResources';
import { useUnlocks } from '@/hooks/useUnlocks';
import { useTourSignals } from './tourSignals';
import {
  CHAPTER1,
  CHAPTER2,
  CHAPTER3,
  CH2_TRIGGER_MATERIAL,
  CH2_TRIGGER_QTY,
  type TourCtx,
  type TourStep,
} from './tourSteps';

type Chapter = 1 | 2 | 3;
type TourState = { chapter: Chapter; step: number; base: TourCtx };

const STEPS: Record<Chapter, TourStep[]> = { 1: CHAPTER1, 2: CHAPTER2, 3: CHAPTER3 };

const ch1Key = (uid: string) => `tour-ch1-done-${uid}`;
const ch2Key = (uid: string) => `tour-ch2-done-${uid}`;

/**
 * Pilote le tutoriel « premiers pas ». Ne tourne que pour un compte NEUF
 * (`tuto_done === false`) qui a déjà choisi son pseudo. Le ch.1 démarre au 1er
 * login ; le ch.2 se déclenche quand le joueur a de quoi forger. Le ch.1 terminé
 * est mémorisé en local, `tuto_done` est écrit en DB à la toute fin (ou au skip).
 */
export function useTour() {
  const { data: profile } = useProfile();
  const { data: heroes } = useHeroes();
  const { data: deployments } = useDeployments();
  const { data: items } = useItems();
  const { data: resources } = useResources();
  const unlocks = useUnlocks();
  const { pathname } = useLocation();
  const qc = useQueryClient();
  const deployModalOpen = useTourSignals((s) => s.deployModalOpen);
  const deployHeroChosen = useTourSignals((s) => s.deployHeroChosen);
  const fightOpen = useTourSignals((s) => s.fightOpen);
  const fightDone = useTourSignals((s) => s.fightDone);

  const userId = profile?.id;
  const active = Boolean(profile) && profile?.tuto_done === false && profile?.pseudo_chosen === true;

  const ctx: TourCtx = useMemo(
    () => ({
      path: pathname,
      heroCount: heroes?.length ?? 0,
      deploymentCount: deployments?.length ?? 0,
      hasLoop: (deployments ?? []).some((d) => d.mode === 'loop'),
      itemCount: items?.length ?? 0,
      equippedCount: (heroes ?? []).reduce(
        (s, h) => s + [h.weapon, h.armor, h.jewel, h.relic].filter(Boolean).length,
        0,
      ),
      villageUnlocked: unlocks.unlocked('village'),
      deployModalOpen,
      deployHeroChosen,
      fightOpen,
      fightDone,
      hasFought: (deployments ?? []).some(
        (d) => d.last_combat != null || (d.last_fights ?? 0) > 0,
      ),
      libraryPoints: (heroes ?? []).reduce((s, h) => s + (h.skillPoints ?? 0), 0),
    }),
    [pathname, heroes, deployments, items, unlocks, deployModalOpen, deployHeroChosen, fightOpen, fightDone],
  );

  // Le ch.2 (craft) n'a de sens que quand la FORGE est débloquée (niveau 3) ET
  // qu'on a de quoi forger — sinon l'étape « va à la Forge » pointe vers du verrouillé.
  const forgeUnlocked = unlocks.unlocked('forge');
  // Idem pour le ch.3 : un point à dépenser ET la Bibliothèque ouverte.
  const libraryUnlocked = unlocks.unlocked('library');

  const [state, setState] = useState<TourState | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const markDone = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase.from('profiles').update({ tuto_done: true }).eq('id', userId);
      localStorage.removeItem(ch1Key(userId));
      localStorage.removeItem(ch2Key(userId));
    } catch {
      /* réseau : le tuto se retentera, sans gravité */
    }
    void qc.invalidateQueries({ queryKey: ['profile', userId] });
  }, [userId, qc]);

  // Démarrage / reprise selon l'état (ch.1 pas fini, ou ch.2 débloqué).
  useEffect(() => {
    if (!active || !userId) {
      setState(null);
      return;
    }
    setState((cur) => {
      if (cur) return cur; // déjà en cours
      if (localStorage.getItem(ch1Key(userId)) !== '1') {
        return { chapter: 1, step: 0, base: ctxRef.current };
      }
      if (localStorage.getItem(ch2Key(userId)) !== '1') {
        const canForge =
          forgeUnlocked && (resources?.[CH2_TRIGGER_MATERIAL] ?? 0) >= CH2_TRIGGER_QTY;
        if (canForge) return { chapter: 2, step: 0, base: ctxRef.current };
        return null; // ch.1 fini, en attente du déclencheur ch.2
      }
      // Ch.3 : au PREMIER point de compétence gagné — c'est là que l'explication
      // sert. Plus tôt c'est de la théorie, plus tard il a déjà cliqué au hasard.
      if (libraryUnlocked && ctxRef.current.libraryPoints > 0) {
        return { chapter: 3, step: 0, base: ctxRef.current };
      }
      return null; // ch.2 fini, en attente du 1er point
    });
  }, [active, userId, resources, forgeUnlocked, libraryUnlocked, ctx.libraryPoints]);

  /**
   * @param fromStep étape depuis laquelle on avance. Sert de GARDE D'IDEMPOTENCE :
   *   l'effet d'avancement se rejoue avec le MÊME `state` avant que le `setState`
   *   précédent soit commité (`ctx` change d'identité à chaque render, donc les
   *   deps de l'effet aussi). Sans cette garde, une condition encore vraie —
   *   « je suis sur /library » l'est toujours juste après — avance DEUX fois et
   *   saute l'étape suivante. Un `manual` était ainsi escamoté sans un clic.
   *   Omis = appel humain (bouton « Compris »), aucune garde nécessaire.
   */
  const goNext = useCallback((fromStep?: number) => {
    setState((cur) => {
      if (!cur) return cur;
      if (fromStep !== undefined && cur.step !== fromStep) return cur;
      const nextStep = cur.step + 1;
      if (nextStep < STEPS[cur.chapter].length) {
        return { chapter: cur.chapter, step: nextStep, base: ctxRef.current };
      }
      // Fin d'un chapitre : chacun attend son propre déclencheur, d'où une trace
      // locale par chapitre (le ch.3 peut tomber des heures après le ch.2).
      if (cur.chapter === 1) {
        if (userId) localStorage.setItem(ch1Key(userId), '1');
        return null;
      }
      if (cur.chapter === 2) {
        if (userId) localStorage.setItem(ch2Key(userId), '1');
        return null;
      }
      void markDone(); // ch.3 fini → tuto terminé
      return null;
    });
  }, [userId, markDone]);

  const skip = useCallback(() => {
    setState(null);
    void markDone();
  }, [markDone]);

  // Avancement automatique des étapes à action.
  useEffect(() => {
    if (!state) return;
    const step = STEPS[state.chapter][state.step];
    if (!step || step.manual || !step.advance) return;
    // `state.step` en garde : cf. `goNext`. Cet effet se rejoue plusieurs fois
    // par transition, il ne doit avancer qu'UNE fois.
    if (step.advance(ctx, state.base)) goNext(state.step);
  }, [ctx, state, goNext]);

  const step: TourStep | null = state ? (STEPS[state.chapter][state.step] ?? null) : null;
  const total = state ? STEPS[state.chapter].length : 0;

  return {
    step,
    stepIndex: state?.step ?? 0,
    total,
    chapter: state?.chapter ?? null,
    goNext,
    skip,
  };
}
