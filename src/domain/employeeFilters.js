/** Lowercase without accents, so "diseno" finds "Diseño" */
function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export const STATUS_FILTERS = Object.freeze({ ACTIVE: 'active', INACTIVE: 'inactive', ALL: 'all' });

/**
 * Filters the employee register: by name or email (accent-insensitive), by team and by status.
 * @param {object[]} employees
 * @param {{ query?: string, team?: string, status?: string }} filters empty team = every team
 */
export function filterEmployees(employees, { query = '', team = '', status = STATUS_FILTERS.ACTIVE } = {}) {
  const needle = normalize(query.trim());

  return employees.filter((employee) => {
    if (status === STATUS_FILTERS.ACTIVE && !employee.active) return false;
    if (status === STATUS_FILTERS.INACTIVE && employee.active) return false;
    if (team && employee.team !== team) return false;
    if (!needle) return true;
    return [employee.name, employee.jobTitle, ...employee.emails].some((text) => normalize(text).includes(needle));
  });
}

/** The distinct teams in use, alphabetical, to offer them in filters and suggestions */
export function teamsOf(employees) {
  return [...new Set(employees.map((employee) => employee.team).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}
