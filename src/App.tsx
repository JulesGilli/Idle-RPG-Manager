import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useUnlocks } from '@/hooks/useUnlocks';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { V2PrepGate } from '@/features/release/V2PrepGate';
import { AppLayout } from '@/components/AppLayout';
import { MapsScreen } from '@/features/maps/MapsScreen';
import { ActivitiesScreen } from '@/features/activities/ActivitiesScreen';
import { HeroScreen } from '@/features/heroes/HeroScreen';
import { TavernScreen } from '@/features/heroes/TavernScreen';
import { InventoryScreen } from '@/features/inventory/InventoryScreen';
import { VillageScreen } from '@/features/village/VillageScreen';
import { ForgeScreen } from '@/features/forge/ForgeScreen';
import { RelicScreen } from '@/features/relic/RelicScreen';
import { JewelryScreen } from '@/features/jewelry/JewelryScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { EncyclopediaScreen } from '@/features/encyclopedia/EncyclopediaScreen';
import { DungeonScreen } from '@/features/dungeon/DungeonScreen';
import { TowerScreen } from '@/features/tower/TowerScreen';
import { ArcEventScreen } from '@/features/arc/ArcEventScreen';
import { ArcSelectScreen } from '@/features/arc/ArcSelectScreen';
import { ExpeditionScreen } from '@/features/expedition/ExpeditionScreen';
import { GuildScreen } from '@/features/guild/GuildScreen';
import { ArenaScreen } from '@/features/arena/ArenaScreen';
import { PantinScreen } from '@/features/pantin/PantinScreen';
import { AchievementsScreen } from '@/features/achievements/AchievementsScreen';
import { ProfileScreen } from '@/features/profile/ProfileScreen';
import { RunesScreen } from '@/features/runes/RunesScreen';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';
import { UiIcon } from '@/components/synty/GameIcons';
import { IntroSplash } from '@/features/intro/IntroSplash';


/** Garde une route derrière son palier de déblocage (niveau de compte, ou 1er matériau pour le Sac). */
function RequireUnlock({ activity, children }: { activity: ActivityKey; children: ReactNode }) {
  const unlocks = useUnlocks();
  if (unlocks.isLoading) return null;
  if (unlocks.unlocked(activity)) return <>{children}</>;
  return (
    <div className="anim-fade mx-auto max-w-md py-16 text-center">
      <div className="mb-3 flex justify-center">
        <UiIcon name="lock" size={40} color="var(--color-muted)" />
      </div>
      <h2 className="heading text-xl">Activité verrouillée</h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        {activity === 'inventory' ? (
          <>
            Débloqué en <strong>ramassant ton premier matériau</strong> (gagne un combat sur la
            carte).
          </>
        ) : activity === 'village' || activity === 'tavern' ? (
          <>
            Débloqué à ta <strong>première défaite</strong> : perds un combat sur la carte et va
            t'entourer d'alliés.
          </>
        ) : (
          <>
            Débloquée au <strong>niveau de compte {ACTIVITY_UNLOCKS[activity]}</strong> (tu es
            niveau {unlocks.level}). Gagne de l'XP de compte en menant des assauts et des
            expéditions.
          </>
        )}
      </p>
      <Link to="/" className="btn btn-primary mt-4 text-sm">
        Retour aux activités
      </Link>
    </div>
  );
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <>
      <IntroSplash />
      <RequireAuth>
        <V2PrepGate>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<ActivitiesScreen />} />
            {/* Sélection d'arc (New Game+) : toujours accessible, pas de palier. */}
            <Route path="arc" element={<ArcSelectScreen />} />
            <Route path="map" element={<MapsScreen />} />
            {/* Escouade fusionnée dans l'Inventaire (onglet Héros). */}
            <Route path="squad" element={<Navigate to="/inventory" replace />} />
            <Route path="hero/:heroId" element={<HeroScreen />} />
            {/* Toujours accessible : l'onglet Héros ne doit jamais être verrouillé. */}
            <Route path="inventory" element={<InventoryScreen />} />
            <Route
              path="village"
              element={
                <RequireUnlock activity="village">
                  <VillageScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="tavern"
              element={
                <RequireUnlock activity="tavern">
                  <TavernScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="forge"
              element={
                <RequireUnlock activity="forge">
                  <ForgeScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="relics"
              element={
                <RequireUnlock activity="relic">
                  <RelicScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="jewelry"
              element={
                <RequireUnlock activity="jewelry">
                  <JewelryScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="library"
              element={
                <RequireUnlock activity="library">
                  <LibraryScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="encyclopedia"
              element={
                <RequireUnlock activity="encyclopedia">
                  <EncyclopediaScreen />
                </RequireUnlock>
              }
            />
            <Route path="pantin" element={<PantinScreen />} />
            <Route path="achievements" element={<AchievementsScreen />} />
            <Route path="profil" element={<ProfileScreen />} />
            <Route path="runes" element={<RunesScreen />} />
            <Route
              path="tower"
              element={
                <RequireUnlock activity="tower">
                  <TowerScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="dungeon"
              element={
                <RequireUnlock activity="dungeon">
                  <DungeonScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="arc-boss"
              element={
                <RequireUnlock activity="arc_boss">
                  <ArcEventScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="expeditions"
              element={
                <RequireUnlock activity="expedition">
                  <ExpeditionScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="guild"
              element={
                <RequireUnlock activity="guild">
                  <GuildScreen />
                </RequireUnlock>
              }
            />
            <Route
              path="arena"
              element={
                <RequireUnlock activity="arena">
                  <ArenaScreen />
                </RequireUnlock>
              }
            />
          </Route>
        </Routes>
        </V2PrepGate>
      </RequireAuth>
    </>
  );
}
