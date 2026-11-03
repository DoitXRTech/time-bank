function parseCommaList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Bootstrap only: these emails become admins on their first sign-in. Access for everyone else
 * is the whitelist itself, i.e. the emails registered on active employees.
 */
export function getInitialAdminEmails() {
  return parseCommaList(process.env.INITIAL_ADMIN_EMAILS);
}

/**
 * Tabs of the team's spreadsheet that the import reads (the `gid` of each tab, visible in the
 * tab's URL). Override them with IMPORT_VACATIONS_GID / IMPORT_OVERTIME_GID if the sheet changes.
 */
export function getImportTabGids() {
  return {
    vacations: process.env.IMPORT_VACATIONS_GID || '896284519',
    overtime: process.env.IMPORT_OVERTIME_GID || '1900223631',
  };
}
