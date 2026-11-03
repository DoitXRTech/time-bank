import { FieldValue } from 'firebase-admin/firestore';
import { todayInAppTimeZone } from '../appDate';
import { importMovementsCollection, importProfilesCollection } from '../collections';
import { getImportTabGids } from '../config';
import { ConflictError, NotFoundError, ValidationError } from '../errors';
import { getAdminFirestore } from '../firebase-admin';
import { fetchSheetTab, fetchSheetWorkbook } from '../sheetsClient';
import { parseHolidaysTab } from '../../src/domain/import/holidaysTab';
import { buildStagingPlan, summarizeStagingPlan } from '../../src/domain/import/stagingPlan';
import { parseOvertimeTab } from '../../src/domain/import/overtimeTab';
import { parseSheetUrl } from '../../src/domain/import/sheetUrl';
import { suggestNameMatch } from '../../src/domain/import/nameMatching';
import { parseVacationsTab } from '../../src/domain/import/vacationsTab';
import { isValidIsoDate } from '../../src/domain/isoDate';

const BATCH_LIMIT = 400;
const HOLIDAY_TAB_NAME = /^Feriados\s+([A-Z]{2})\b/;
const VACATION_TAB_NAME = /^Vacaciones/i;
const MAX_STORED_ISSUES = 50;
const MAX_SUGGESTIONS = 3;

export const PROFILE_STATUS = Object.freeze({ PENDING: 'pending', LINKED: 'linked', DISCARDED: 'discarded' });

/** Id of a staged movement: the person plus the position the row had in the sheet */
export function stagedMovementId(profileKey, importKey) {
  return `${profileKey}__${importKey.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

export function serializeImportProfile(doc) {
  const data = doc.data();
  return {
    key: doc.id,
    name: data.name,
    team: data.team ?? null,
    hiddenInSheet: Boolean(data.hiddenInSheet),
    employment: data.employment ?? {},
    aliases: data.aliases ?? [],
    vacationStartDate: data.vacationStartDate ?? null,
    openingDate: data.openingDate,
    status: data.status,
    needsReview: Boolean(data.needsReview),
    reviewReason: data.reviewReason ?? null,
    movementCount: data.movementCount ?? 0,
    totals: data.totals ?? {},
    issueCount: data.issueCount ?? 0,
    issues: data.issues ?? [],
    linkedEmployeeId: data.linkedEmployeeId ?? null,
  };
}

async function loadStagingPlan(sheetUrl, openingDate) {
  const sheetId = parseSheetUrl(sheetUrl);
  if (!sheetId) throw new ValidationError('Not a Google Sheets link', { field: 'sheetUrl', reason: 'INVALID_SHEET_URL' });
  if (!isValidIsoDate(openingDate)) throw new ValidationError('openingDate must be YYYY-MM-DD', { field: 'openingDate', reason: 'INVALID_DATE' });

  const gids = getImportTabGids();
  // Vacations and overtime come as CSV (plain values); the workbook adds what CSV loses: the holiday
  // tabs need the strikethrough (struck "Reponer" = already repaid) and the hidden rows flag people
  const [vacationRows, overtimeRows, workbook] = await Promise.all([
    fetchSheetTab(sheetId, gids.vacations),
    fetchSheetTab(sheetId, gids.overtime),
    fetchSheetWorkbook(sheetId),
  ]);

  const vacations = parseVacationsTab(vacationRows);
  const defaultYear = Number(openingDate.slice(0, 4));
  const overtime = parseOvertimeTab(overtimeRows, { defaultYear });

  // One tab per country, named like "Feriados CR 26"
  const holidays = workbook
    .map((sheet) => ({ sheet, country: HOLIDAY_TAB_NAME.exec(sheet.name)?.[1] }))
    .filter(({ country }) => country)
    .map(({ sheet, country }) => parseHolidaysTab(sheet, { country, defaultYear }));
  const vacationHiddenRows = workbook.find((sheet) => VACATION_TAB_NAME.test(sheet.name))?.hiddenRows ?? new Set();

  return buildStagingPlan({ vacations, overtime, holidays, vacationHiddenRows, openingDate });
}

async function commitInBatches(operations) {
  const db = getAdminFirestore();
  for (let start = 0; start < operations.length; start += BATCH_LIMIT) {
    const batch = db.batch();
    operations.slice(start, start + BATCH_LIMIT).forEach((apply) => apply(batch));
    await batch.commit();
  }
}

/** Writes one person and their movements; removes staged movements that are no longer in the sheet */
async function stageProfile(actor, profile, openingDate) {
  const profileRef = importProfilesCollection().doc(profile.key);
  const existing = await profileRef.get();
  if (existing.exists && existing.data().status === PROFILE_STATUS.LINKED) return 'skipped-linked';

  const staleSnapshot = await importMovementsCollection().where('profileKey', '==', profile.key).get();
  const newIds = new Set(profile.movements.map((movement) => stagedMovementId(profile.key, movement.importKey)));

  const operations = [
    (batch) =>
      batch.set(profileRef, {
        name: profile.name,
        team: profile.team,
        hiddenInSheet: profile.hiddenInSheet,
        employment: profile.employment,
        aliases: profile.aliases,
        vacationStartDate: profile.vacationStartDate,
        openingDate,
        // Loading the sheet again also brings back a person that had been discarded
        status: PROFILE_STATUS.PENDING,
        needsReview: profile.needsReview,
        reviewReason: profile.reviewReason,
        movementCount: profile.movements.length,
        totals: profile.totals,
        issueCount: profile.issues.length,
        issues: profile.issues.slice(0, MAX_STORED_ISSUES),
        linkedEmployeeId: null,
        stagedBy: actor.id,
        stagedAt: FieldValue.serverTimestamp(),
      }),
    ...profile.movements.map((movement) => (batch) =>
      batch.set(importMovementsCollection().doc(stagedMovementId(profile.key, movement.importKey)), { ...movement, profileKey: profile.key }),
    ),
    ...staleSnapshot.docs.filter((doc) => !newIds.has(doc.id)).map((doc) => (batch) => batch.delete(doc.ref)),
  ];

  await commitInBatches(operations);
  return existing.exists ? 'updated' : 'created';
}

function describeProfiles(plan) {
  return plan.profiles.map((profile) => ({
    key: profile.key,
    name: profile.name,
    aliases: profile.aliases,
    movementCount: profile.movements.length,
    totals: profile.totals,
    needsReview: profile.needsReview,
    issueCount: profile.issues.length,
  }));
}

/** Reads the sheet and shows what would be saved. Writes nothing. */
export async function previewImport(sheetUrl, { openingDate = todayInAppTimeZone() } = {}) {
  const plan = await loadStagingPlan(sheetUrl, openingDate);
  return { ...summarizeStagingPlan(plan), profiles: describeProfiles(plan) };
}

/**
 * Reads the sheet and saves every person with their movements as "pending": nothing is tied to an
 * employee yet. Loading the same sheet again updates what is still pending and leaves alone
 * whoever was already linked to an employee.
 */
export async function stageImport(actor, sheetUrl, { openingDate = todayInAppTimeZone() } = {}) {
  const plan = await loadStagingPlan(sheetUrl, openingDate);

  const outcomes = { created: 0, updated: 0, 'skipped-linked': 0 };
  for (const profile of plan.profiles) {
    outcomes[await stageProfile(actor, profile, openingDate)] += 1;
  }

  return {
    ...summarizeStagingPlan(plan),
    profiles: describeProfiles(plan),
    saved: { created: outcomes.created, updated: outcomes.updated, alreadyLinked: outcomes['skipped-linked'] },
  };
}

export async function listImportProfiles(status = PROFILE_STATUS.PENDING) {
  const snapshot = await importProfilesCollection().where('status', '==', status).get();
  return snapshot.docs.map(serializeImportProfile).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/**
 * Pending people whose name looks like `name` (used when a collaborator is added: "we have
 * information of ..."). Also looks at the other names each person was found under.
 * @returns {Promise<Array<{ profile: object, confidence: 'exact'|'fuzzy'|'ambiguous' }>>}
 */
export async function suggestImportProfiles(name) {
  const profiles = await listImportProfiles(PROFILE_STATUS.PENDING);

  const profileByName = new Map();
  profiles.forEach((profile) => {
    [profile.name, ...profile.aliases.map((alias) => alias.name)].forEach((knownName) => profileByName.set(knownName, profile));
  });

  const { confidence, candidates } = suggestNameMatch(name, [...profileByName.keys()]);
  if (confidence === 'none') return [];

  const distinct = [...new Map(candidates.map((candidate) => [profileByName.get(candidate).key, profileByName.get(candidate)])).values()];
  return distinct.slice(0, MAX_SUGGESTIONS).map((profile) => ({ profile, confidence }));
}

/** Not a person of the team (or someone who left): stops being offered. Loading the sheet again brings it back. */
export async function discardImportProfile(actor, profileKey) {
  const ref = importProfilesCollection().doc(profileKey);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new NotFoundError('Imported person not found');
  if (snapshot.data().status === PROFILE_STATUS.LINKED) {
    throw new ConflictError('This person is already linked to an employee', { reason: 'PROFILE_NOT_PENDING' });
  }

  await ref.update({ status: PROFILE_STATUS.DISCARDED, discardedBy: actor.id, discardedAt: FieldValue.serverTimestamp() });
  return serializeImportProfile(await ref.get());
}
