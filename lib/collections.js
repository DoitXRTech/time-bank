import { getAdminFirestore } from './firebase-admin';

export const COLLECTIONS = Object.freeze({
  EMPLOYEES: 'employees',
  MOVEMENTS: 'movements',
  IMPORT_PROFILES: 'importProfiles',
  IMPORT_MOVEMENTS: 'importMovements',
});

export function employeesCollection() {
  return getAdminFirestore().collection(COLLECTIONS.EMPLOYEES);
}

export function movementsCollection() {
  return getAdminFirestore().collection(COLLECTIONS.MOVEMENTS);
}

// People found in an imported spreadsheet that are not tied to an employee yet
export function importProfilesCollection() {
  return getAdminFirestore().collection(COLLECTIONS.IMPORT_PROFILES);
}

// Their movements, waiting to become real movements when the person is linked to an employee
export function importMovementsCollection() {
  return getAdminFirestore().collection(COLLECTIONS.IMPORT_MOVEMENTS);
}
