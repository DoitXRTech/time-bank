import { useState } from 'react';
import { ImportPanel } from '../components/admin/ImportPanel';
import { MovementForm } from '../components/admin/MovementForm';
import { PendingProfiles } from '../components/admin/PendingProfiles';
import { movementsUrl, RecentMovements } from '../components/admin/RecentMovements';
import { SummaryTable } from '../components/admin/SummaryTable';
import { ErrorNotice } from '../components/ErrorNotice';
import { RequireAuth } from '../components/RequireAuth';
import { useApiData } from '../hooks/useApiData';

function AdminView() {
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const employeesResource = useApiData('/api/employees');
  const movementsResource = useApiData(movementsUrl(filterEmployeeId));
  const pendingResource = useApiData('/api/import-profiles');

  const employees = employeesResource.data?.employees ?? [];
  const movements = movementsResource.data?.movements ?? [];
  const pendingProfiles = pendingResource.data?.profiles ?? [];

  // Balances live on the employee docs, so any movement change refreshes both lists
  function reloadAll() {
    employeesResource.reload();
    movementsResource.reload();
  }

  // Linking imported information creates movements and moves balances, and empties the pending list
  function reloadAfterImportLinked() {
    reloadAll();
    pendingResource.reload();
  }

  return (
    <>
      <ErrorNotice error={employeesResource.error ?? movementsResource.error ?? pendingResource.error} />
      <SummaryTable employees={employees} loading={employeesResource.loading} />
      <MovementForm employees={employees} onSaved={reloadAll} />
      <RecentMovements
        movements={movements}
        employees={employees}
        loading={movementsResource.loading}
        filterEmployeeId={filterEmployeeId}
        onFilterChange={setFilterEmployeeId}
        onChanged={reloadAll}
      />
      <ImportPanel onStaged={pendingResource.reload} />
      <PendingProfiles profiles={pendingProfiles} employees={employees} loading={pendingResource.loading} onChanged={reloadAfterImportLinked} />
    </>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth adminOnly>
      <AdminView />
    </RequireAuth>
  );
}
