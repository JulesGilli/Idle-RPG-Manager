import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from '@/components/AppLayout';
import { MapsScreen } from '@/features/maps/MapsScreen';
import { SquadScreen } from '@/features/heroes/SquadScreen';
import { TavernScreen } from '@/features/heroes/TavernScreen';
import { InventoryScreen } from '@/features/inventory/InventoryScreen';
import { VillageScreen } from '@/features/village/VillageScreen';
import { ForgeScreen } from '@/features/forge/ForgeScreen';
import { JewelryScreen } from '@/features/jewelry/JewelryScreen';
import { LeaderboardScreen } from '@/features/leaderboard/LeaderboardScreen';

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
          <Route path="tavern" element={<TavernScreen />} />
          <Route path="inventory" element={<InventoryScreen />} />
          <Route path="village" element={<VillageScreen />} />
          <Route path="forge" element={<ForgeScreen />} />
          <Route path="jewelry" element={<JewelryScreen />} />
          <Route path="leaderboard" element={<LeaderboardScreen />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
