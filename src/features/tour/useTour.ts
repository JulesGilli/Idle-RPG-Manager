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
import {
  CHAPTER1,
  CHAPTER2,
  CH2_TRIGGER_MATERIAL,
  CH2_TRIGGER_QTY,
  type TourCtx,
  type TourStep,
} from './tourSteps';

type TourState = { chapter: 1 | 2; step: number; base: TourCtx };

const ch1Key = (uid: string) => `tour-ch1-done-${uid}`;

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
    }),
    [pathname, heroes, deployments, items, unlocks],
  );

  // Le ch.2 (craft) n'a de sens que quand la FORGE est débloquée (niveau 3) ET
  // qu'on a de quoi forger — sinon l'étape « va à la Forge » pointe vers du verrouillé.
  const forgeUnlocked = unlocks.unlocked('forge');

  const [state, setState] = useState<TourState | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const markDone = useCallback(async () => {
    if (!userId) return;
    try {
      await supabase.from('profiles').update({ tuto_done: true }).eq('id', userId);
      localStorage.removeItem(ch1Key(userId));
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
      const ch1Done = localStorage.getItem(ch1Key(userId)) === '1';
      if (!ch1Done) return { chapter: 1, step: 0, base: ctxRef.current };
      const canForge =
        forgeUnlocked && (resources?.[CH2_TRIGGER_MATERIAL] ?? 0) >= CH2_TRIGGER_QTY;
      if (canForge) return { chapter: 2, step: 0, base: ctxRef.current };
      return null; // ch.1 fini, en attente du déclencheur ch.2
    });
  }, [active, userId, resources, forgeUnlocked]);

  const goNext = useCallback(() => {
    setState((cur) => {
      if (!cur) return cur;
      const steps = cur.chapter === 1 ? CHAPTER1 : CHAPTER2;
      const nextStep = cur.step + 1;
      if (nextStep < steps.length) {
        return { chapter: cur.chapter, step: nextStep, base: ctxRef.current };
      }
      // Fin d'un chapitre.
      if (cur.chapter === 1) {
        if (userId) localStorage.setItem(ch1Key(userId), '1');
        return null; // attend le déclencheur du ch.2
      }
      void markDone(); // ch.2 fini → tuto terminé
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
    const steps = state.chapter === 1 ? CHAPTER1 : CHAPTER2;
    const step = steps[state.step];
    if (!step || step.manual || !step.advance) return;
    if (step.advance(ctx, state.base)) goNext();
  }, [ctx, state, goNext]);

  const step: TourStep | null = state
    ? ((state.chapter === 1 ? CHAPTER1 : CHAPTER2)[state.step] ?? null)
    : null;
  const total = state ? (state.chapter === 1 ? CHAPTER1 : CHAPTER2).length : 0;

  return {
    step,
    stepIndex: state?.step ?? 0,
    total,
    chapter: state?.chapter ?? null,
    goNext,
    skip,
  };
}
