import { useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { AppLayout } from '@/components/AppLayout';
import { SquadScreen } from '@/features/heroes/SquadScreen';
import { DungeonsScreen } from '@/features/dungeons/DungeonsScreen';
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
          <Route index element={<SquadScreen />} />
          <Route path="dungeons" element={<DungeonsScreen />} />
          <Route path="leaderboard" element={<LeaderboardScreen />} />
        </Route>
      </Routes>
    </RequireAuth>
  );
}
