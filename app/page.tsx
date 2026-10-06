import Dashboard from '@/components/Dashboard';
import { listRepos } from '@/lib/store';

// Always read the on-disk index at request time (never a build-time snapshot).
export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialRepos = await listRepos();
  return (
    <div className="flex min-h-screen flex-col text-foreground">
      <Dashboard initialRepos={initialRepos} />
    </div>
  );
}
