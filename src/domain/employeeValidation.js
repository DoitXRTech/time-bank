import { ValidationError } from '../../lib/errors';
import { COUNTRY_LIST } from './countries';
import { EMPLOYMENT_TYPE_LIST } from './employmentTypes';
import { isValidIsoDate } from './isoDate';
import { ROLE_LIST, ROLES } from './movementTypes';

const MAX_NAME_LENGTH = 100;
const MAX_JOB_TITLE_LENGTH = 100;
const MAX_TEAM_LENGTH = 60;
// The sheet writes schedules as free text ("8:00 am", "L-M-V 5:00 PM  M-J 12:00 md")
const MAX_SCHEDULE_LENGTH = 60;
const MAX_EMAIL_LENGTH = 254;
export const MAX_EMAILS_PER_EMPLOYEE = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(field, reason, message) {
  throw new ValidationError(message, { field, reason });
}

function requiredText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail(field, 'REQUIRED', `${field} is required`);
  if (text.length > maxLength) fail(field, 'TOO_LONG', `${field} exceeds ${maxLength} characters`);
  return text;
}

function optionalText(value, field, maxLength) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maxLength) fail(field, 'TOO_LONG', `${field} exceeds ${maxLength} characters`);
  return text;
}

function validateRole(role) {
  if (!ROLE_LIST.includes(role)) fail('role', 'INVALID_ROLE', `role must be one of: ${ROLE_LIST.join(', ')}`);
  return role;
}

/** A date field that can be left empty: `null`/empty -> null, otherwise a valid YYYY-MM-DD date */
function validateOptionalDate(value, field) {
  if (value === null || value === '') return null;
  if (!isValidIsoDate(value)) fail(field, 'INVALID_DATE', `${field} must be a valid YYYY-MM-DD date`);
  return value;
}

/** Where the person works (their holidays are the country's). Required to add someone. */
function validateCountry(value) {
  if (value === undefined || value === null || value === '') fail('country', 'REQUIRED', 'country is required');
  if (!COUNTRY_LIST.includes(value)) fail('country', 'INVALID_COUNTRY', `country must be one of: ${COUNTRY_LIST.join(', ')}`);
  return value;
}

function validateEmploymentType(value) {
  if (value === null || value === '') return null;
  if (!EMPLOYMENT_TYPE_LIST.includes(value)) {
    fail('employmentType', 'INVALID_EMPLOYMENT_TYPE', `employmentType must be one of: ${EMPLOYMENT_TYPE_LIST.join(', ')}`);
  }
  return value;
}

/** Only meaningful the first time vacations start accruing: credit the months already completed */
function validateCreditPastMonths(value) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail('creditPastMonths', 'INVALID_TYPE', 'creditPastMonths must be a boolean');
  return value;
}

/**
 * An employee can sign in with several emails (e.g. personal and company). The list is the
 * whitelist entry of that person: lowercased, trimmed and without duplicates.
 * @returns {string[]}
 */
export function validateEmails(value) {
  if (!Array.isArray(value) || value.length === 0) fail('emails', 'REQUIRED', 'At least one email is required');

  const normalized = value.map((email) => (typeof email === 'string' ? email.trim().toLowerCase() : ''));
  if (normalized.some((email) => !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH)) {
    fail('emails', 'INVALID_EMAIL', 'One of the emails is not valid');
  }

  const unique = [...new Set(normalized)];
  if (unique.length > MAX_EMAILS_PER_EMPLOYEE) {
    fail('emails', 'TOO_MANY_EMAILS', `An employee can have at most ${MAX_EMAILS_PER_EMPLOYEE} emails`);
  }
  return unique;
}

/**
 * Besides the account data it reads the employee record: country (required), team, hire date (the
 * only date of the record, it is also when vacations start accruing), employment type and schedule.
 * The vacation start date is not an input: it comes from the hire date and the employment type.
 * @returns {{ name: string, jobTitle: string, emails: string[], role: string, country: string, team: string, hireDate: string|null, employmentType: string|null, scheduleStart: string, scheduleEnd: string, creditPastMonths: boolean }}
 * @throws {ValidationError} with metadata `{ field, reason }`
 */
export function validateNewEmployee(input) {
  return {
    name: requiredText(input?.name, 'name', MAX_NAME_LENGTH),
    jobTitle: optionalText(input?.jobTitle, 'jobTitle', MAX_JOB_TITLE_LENGTH),
    emails: validateEmails(input?.emails),
    role: input?.role === undefined ? ROLES.MEMBER : validateRole(input.role),
    country: validateCountry(input?.country),
    team: optionalText(input?.team, 'team', MAX_TEAM_LENGTH),
    hireDate: validateOptionalDate(input?.hireDate ?? null, 'hireDate'),
    employmentType: validateEmploymentType(input?.employmentType ?? null),
    scheduleStart: optionalText(input?.scheduleStart, 'scheduleStart', MAX_SCHEDULE_LENGTH),
    scheduleEnd: optionalText(input?.scheduleEnd, 'scheduleEnd', MAX_SCHEDULE_LENGTH),
    creditPastMonths: validateCreditPastMonths(input?.creditPastMonths),
  };
}

/** Only the fields present in `input` are validated and returned. */
export function validateEmployeePatch(input) {
  const patch = {};
  if (input?.name !== undefined) patch.name = requiredText(input.name, 'name', MAX_NAME_LENGTH);
  if (input?.jobTitle !== undefined) patch.jobTitle = optionalText(input.jobTitle, 'jobTitle', MAX_JOB_TITLE_LENGTH);
  if (input?.role !== undefined) patch.role = validateRole(input.role);
  if (input?.team !== undefined) patch.team = optionalText(input.team, 'team', MAX_TEAM_LENGTH);
  if (input?.hireDate !== undefined) patch.hireDate = validateOptionalDate(input.hireDate, 'hireDate');
  if (input?.country !== undefined) patch.country = validateCountry(input.country);
  if (input?.employmentType !== undefined) patch.employmentType = validateEmploymentType(input.employmentType);
  if (input?.scheduleStart !== undefined) patch.scheduleStart = optionalText(input.scheduleStart, 'scheduleStart', MAX_SCHEDULE_LENGTH);
  if (input?.scheduleEnd !== undefined) patch.scheduleEnd = optionalText(input.scheduleEnd, 'scheduleEnd', MAX_SCHEDULE_LENGTH);
  if (input?.emails !== undefined) patch.emails = validateEmails(input.emails);
  if (input?.creditPastMonths !== undefined) patch.creditPastMonths = validateCreditPastMonths(input.creditPastMonths);
  if (input?.active !== undefined) {
    if (typeof input.active !== 'boolean') fail('active', 'INVALID_TYPE', 'active must be a boolean');
    patch.active = input.active;
  }
  if (!Object.keys(patch).length) fail('body', 'EMPTY_PATCH', 'No updatable fields were provided');
  return patch;
}
