import { useEffect, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useAccount } from '@/hooks/useAccount';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from '@/components/AppLayout';
import { MapsScreen } from '@/features/maps/MapsScreen';
import { SquadScreen } from '@/features/heroes/SquadScreen';
import { TavernScreen } from '@/features/heroes/TavernScreen';
import { InventoryScreen } from '@/features/inventory/InventoryScreen';
import { VillageScreen } from '@/features/village/VillageScreen';
import { ForgeScreen } from '@/features/forge/ForgeScreen';
import { RelicScreen } from '@/features/relic/RelicScreen';
import { JewelryScreen } from '@/features/jewelry/JewelryScreen';
import { LibraryScreen } from '@/features/library/LibraryScreen';
import { DungeonScreen } from '@/features/dungeon/DungeonScreen';
import { GuildScreen } from '@/features/guild/GuildScreen';
import { ACTIVITY_UNLOCKS, type ActivityKey } from '@shared/progression/account.ts';
import { UiIcon } from '@/components/synty/GameIcons';

/** Garde une route derrière un palier de niveau de compte. */
function RequireUnlock({ activity, children }: { activity: ActivityKey; children: ReactNode }) {
  const account = useAccount();
  if (account.isLoading) return null;
  if (account.unlocked(activity)) return <>{children}</>;
  return (
    <div className="anim-fade mx-auto max-w-md py-16 text-center">
      <div className="mb-3 flex justify-center">
        <UiIcon name="lock" size={40} color="var(--color-muted)" />
      </div>
      <h2 className="heading text-xl">Activité verrouillée</h2>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Débloquée au <strong>niveau de compte {ACTIVITY_UNLOCKS[activity]}</strong> (tu es niveau{' '}
        {account.level}). Gagne de l'XP de compte en menant des assauts et des expéditions.
      </p>
      <Link to="/" className="btn btn-primary mt-4 text-sm">
        Retour à la carte
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
    <RequireAuth>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<MapsScreen />} />
          <Route path="squad" element={<SquadScreen />} />
          <Route
            path="inventory"
            element={
              <RequireUnlock activity="inventory">
                <InventoryScreen />
              </RequireUnlock>
            }
          />
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
            path="dungeon"
            element={
              <RequireUnlock activity="dungeon">
                <DungeonScreen />
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
        </Route>
      </Routes>
    </RequireAuth>
  );
}
