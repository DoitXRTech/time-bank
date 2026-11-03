/**
 * Reads the employee record fields from a submitted form into the API payload.
 * Empty dates and employment type are sent as `null` (not set).
 */
export function readRecordFields(formData) {
  return {
    team: formData.get('team') ?? '',
    hireDate: formData.get('hireDate') || null,
    socialSecurityDate: formData.get('socialSecurityDate') || null,
    employmentType: formData.get('employmentType') || null,
    scheduleStart: formData.get('scheduleStart') ?? '',
    scheduleEnd: formData.get('scheduleEnd') ?? '',
    vacationStartDate: formData.get('vacationStartDate') || null,
    creditPastMonths: formData.get('creditPastMonths') === 'on',
  };
}
