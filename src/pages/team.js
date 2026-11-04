import { EmployeeManager } from '../components/team/EmployeeManager';
import { ErrorNotice } from '../components/ErrorNotice';
import { RequireAuth } from '../components/RequireAuth';
import { useApiData } from '../hooks/useApiData';
import { LIVE_REFRESH_MS } from '../lib/liveRefresh';

function TeamView() {
  // Other admins add, edit or deactivate people while this page is open
  const employeesResource = useApiData('/api/employees', { refreshIntervalMs: LIVE_REFRESH_MS });

  return (
    <>
      <ErrorNotice error={employeesResource.error} />
      <EmployeeManager
        employees={employeesResource.data?.employees ?? []}
        loading={employeesResource.loading}
        onChanged={employeesResource.reload}
      />
    </>
  );
}

export default function TeamPage() {
  return (
    <RequireAuth adminOnly>
      <TeamView />
    </RequireAuth>
  );
}
