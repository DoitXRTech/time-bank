import { useMemo, useState } from 'react';
import { BalanceCard } from '../components/BalanceCard';
import { ErrorNotice } from '../components/ErrorNotice';
import { HistoryPanel } from '../components/HistoryPanel';
import { RequireAuth } from '../components/RequireAuth';
import { Section } from '../components/Section';
import { MyRequests } from '../components/requests/MyRequests';
import { RequestForm } from '../components/requests/RequestForm';
import { BalanceCardSkeleton } from '../components/Skeleton';
import { useAuth } from '../context/AuthContext';
import es from '../content/es';
import { employeesInView } from '../domain/balanceView';
import { useRequestsInbox } from '../context/RequestsInboxContext';
import { useApiData } from '../hooks/useApiData';
import { useOnChange } from '../hooks/useOnChange';
import { LIVE_REFRESH_MS, OWN_REQUESTS_REFRESH_MS } from '../lib/liveRefresh';

const LIVE_OPTIONS = { refreshIntervalMs: LIVE_REFRESH_MS };
const OWN_REQUESTS_OPTIONS = { refreshIntervalMs: OWN_REQUESTS_REFRESH_MS };

/** One string that changes when any request changes status (or one is added) */
const requestStatuses = (requests) => requests.map((request) => `${request.id}:${request.status}`).join(',');

function normalize(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function BalancesView() {
  // Balances and the answers to requests change while the page is open (an admin approves one)
  const { data, error, loading, reload: reloadEmployees } = useApiData('/api/employees', LIVE_OPTIONS);
  const { employee: signedInEmployee, isAdmin, previewAsMember } = useAuth();
  const inbox = useRequestsInbox();
  const ownRequests = useApiData(
    signedInEmployee ? `/api/requests?employeeId=${encodeURIComponent(signedInEmployee.id)}` : null,
    OWN_REQUESTS_OPTIONS,
  );

  // An approval is what moves a balance: when an answer arrives, the balances come right after it
  useOnChange(ownRequests.data ? requestStatuses(ownRequests.data.requests) : null, reloadEmployees);

  // What the person has, shown in the form before they redeem something
  const ownBalances = data?.employees.find((employee) => employee.id === signedInEmployee?.id)?.balances;

  // An admin who files a request in this same session sees their own inbox grow at once
  function handleRequestSent() {
    ownRequests.reload();
    inbox.reload();
  }
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  // In "view as collaborator" mode an admin sees only their own card, like a collaborator does
  const employeesShown = useMemo(
    () => employeesInView(data?.employees ?? [], { previewAsMember, selfId: signedInEmployee?.id }),
    [data, previewAsMember, signedInEmployee],
  );

  const visibleEmployees = useMemo(() => {
    const needle = normalize(query.trim());
    return employeesShown.filter((employee) => employee.active && (!needle || normalize(employee.name).includes(needle)));
  }, [employeesShown, query]);

  // A member only ever receives their own card, so it opens without a click
  const effectiveSelectedId = selectedId ?? (visibleEmployees.length === 1 ? visibleEmployees[0].id : null);
  const selectedEmployee = visibleEmployees.find((employee) => employee.id === effectiveSelectedId);
  const showSearch = employeesShown.length > 1;
  // While loading, as many placeholder cards as the person is going to see: one for a member, a few for an admin
  const skeletonCount = isAdmin ? 3 : 1;

  return (
    <>
      <Section bare title={showSearch ? es.balances.teamBalances : es.balances.ownBalances}>
        {showSearch && (
          <input
            type="search"
            className="field-input mb-5 w-full max-w-[320px]"
            placeholder={es.balances.searchPlaceholder}
            aria-label={es.balances.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}

        <ErrorNotice error={error} />

        {data && visibleEmployees.length === 0 && <p className="py-4 text-sm text-ink-soft">{es.balances.noResults}</p>}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {loading && !data && Array.from({ length: skeletonCount }, (_, index) => <BalanceCardSkeleton key={index} />)}
          {visibleEmployees.map((employee) => (
            <BalanceCard
              key={employee.id}
              employee={employee}
              selected={employee.id === effectiveSelectedId}
              onSelect={setSelectedId}
            />
          ))}
        </div>
      </Section>

      {selectedEmployee && (
        <HistoryPanel key={selectedEmployee.id} employee={selectedEmployee} onClose={() => setSelectedId('')} />
      )}

      <RequestForm onSent={handleRequestSent} balances={ownBalances} />
      <MyRequests
        requests={ownRequests.data?.requests ?? []}
        loading={ownRequests.loading}
        error={ownRequests.error}
        onChanged={ownRequests.reload}
      />
    </>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <BalancesView />
    </RequireAuth>
  );
}
