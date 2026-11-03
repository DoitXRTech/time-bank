// How a person is employed (the "Método" column of the team's sheet). Labels live in content/es.js.
export const EMPLOYMENT_TYPES = Object.freeze({
  // CCSS: on the payroll, with social security
  PAYROLL: 'payroll',
  // S.P: professional services (invoices, no payroll)
  PROFESSIONAL_SERVICES: 'professional-services',
  INTERNSHIP: 'internship',
});

export const EMPLOYMENT_TYPE_LIST = Object.freeze(Object.values(EMPLOYMENT_TYPES));
