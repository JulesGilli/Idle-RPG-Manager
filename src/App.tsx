import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from '@/components/AppLayout';
import { MapsScreen } from '@/features/maps/MapsScreen';
import { SquadScreen } from '@/features/heroes/SquadScreen';
import { VillageScreen } from '@/features/village/VillageScreen';
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
          <Route path="village" element={<VillageScreen />} />
          <Route path="leaderboard" element={<LeaderboardScreen />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
