import { useEffect, useState } from 'react';
import { ImportPanel } from '../components/admin/ImportPanel';
import { MovementForm } from '../components/admin/MovementForm';
import { PendingProfiles } from '../components/admin/PendingProfiles';
import { movementsUrl, RecentMovements } from '../components/admin/RecentMovements';
import { RequestsInbox } from '../components/admin/RequestsInbox';
import { SummaryTable } from '../components/admin/SummaryTable';
import { ErrorNotice } from '../components/ErrorNotice';
import { RequireAuth } from '../components/RequireAuth';
import { useRequestsInbox } from '../context/RequestsInboxContext';
import { useApiData } from '../hooks/useApiData';
import { LIVE_REFRESH_MS } from '../lib/liveRefresh';

const LIVE_OPTIONS = { refreshIntervalMs: LIVE_REFRESH_MS };

function AdminView() {
  const [filterEmployeeId, setFilterEmployeeId] = useState('');
  const requestsInbox = useRequestsInbox();
  // The inbox lives above the pages and was last loaded whenever it last ticked: entering this page asks for it fresh
  const reloadInbox = requestsInbox.reload;
  useEffect(() => {
    reloadInbox();
  }, [reloadInbox]);
  // Balances and the team's latest movements move while the page is open (a request is approved,
  // another admin registers something). The long per-person history is not polled: it costs a
  // read per movement every tick. The inbox refreshes inside its own provider.
  const employeesResource = useApiData('/api/employees', LIVE_OPTIONS);
  const movementsResource = useApiData(movementsUrl(filterEmployeeId), filterEmployeeId ? undefined : LIVE_OPTIONS);
  const pendingResource = useApiData('/api/import-profiles');

  const employees = employeesResource.data?.employees ?? [];
  const movements = movementsResource.data?.movements ?? [];
  const pendingProfiles = pendingResource.data?.profiles ?? [];

  // Balances live on the employee docs, so any movement change refreshes both lists
  function reloadAll() {
    employeesResource.reload();
    movementsResource.reload();
  }

  // Approving a request registers a movement; rejecting one only empties the inbox (and the header badge)
  function reloadAfterRequestDecided() {
    reloadAll();
    requestsInbox.reload();
  }

  // Linking imported information creates movements and moves balances, and empties the pending list
  function reloadAfterImportLinked() {
    reloadAll();
    pendingResource.reload();
  }

  return (
    <>
      <ErrorNotice error={employeesResource.error ?? movementsResource.error ?? pendingResource.error} />
      <RequestsInbox
        requests={requestsInbox.requests}
        employees={employees}
        loading={requestsInbox.loading}
        error={requestsInbox.error}
        onChanged={reloadAfterRequestDecided}
      />
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
