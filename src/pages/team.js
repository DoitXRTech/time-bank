import { EmployeeManager } from '../components/team/EmployeeManager';
import { ErrorNotice } from '../components/ErrorNotice';
import { RequireAuth } from '../components/RequireAuth';
import { useApiData } from '../hooks/useApiData';

function TeamView() {
  const employeesResource = useApiData('/api/employees');

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
