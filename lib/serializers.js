import { normalizeBalances } from '../src/domain/balances';

/** Firestore Timestamps are persisted as such and converted to ISO strings only at the API boundary */
function timestampToIso(value) {
  return value?.toDate ? value.toDate().toISOString() : null;
}

/** Documents created before multi-email support only have the single `email` field */
export function readEmails(data) {
  if (Array.isArray(data.emails)) return data.emails;
  return data.email ? [data.email] : [];
}

export function serializeEmployee(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name,
    jobTitle: data.jobTitle ?? '',
    emails: readEmails(data),
    role: data.role,
    team: data.team ?? '',
    hireDate: data.hireDate ?? null,
    socialSecurityDate: data.socialSecurityDate ?? null,
    employmentType: data.employmentType ?? null,
    scheduleStart: data.scheduleStart ?? '',
    scheduleEnd: data.scheduleEnd ?? '',
    vacationStartDate: data.vacationStartDate ?? null,
    active: data.active !== false,
    balances: normalizeBalances(data.balances),
  };
}

export function serializeMovement(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    employeeId: data.employeeId,
    type: data.type,
    amount: data.amount,
    date: data.date,
    note: data.note ?? '',
    createdBy: data.createdBy,
    createdAt: timestampToIso(data.createdAt),
    source: data.source ?? 'manual',
    editedAt: timestampToIso(data.editedAt),
    editCount: Array.isArray(data.editHistory) ? data.editHistory.length : 0,
    voidedAt: timestampToIso(data.voidedAt),
    voidedBy: data.voidedBy ?? null,
    voidReason: data.voidReason ?? null,
  };
}
