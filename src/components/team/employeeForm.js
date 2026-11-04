/**
 * Reads the employee record fields from a submitted form into the API payload.
 * An empty hire date or employment type is sent as `null` (not set). The country is only sent when
 * one is chosen (an older record without a country can be saved without setting it). The vacation
 * start is not sent: the server derives it from the hire date and the employment type.
 */
export function readRecordFields(formData) {
  const country = formData.get('country');
  return {
    ...(country ? { country } : {}),
    team: formData.get('team') ?? '',
    hireDate: formData.get('hireDate') || null,
    employmentType: formData.get('employmentType') || null,
    scheduleStart: formData.get('scheduleStart') ?? '',
    scheduleEnd: formData.get('scheduleEnd') ?? '',
    creditPastMonths: formData.get('creditPastMonths') === 'on',
  };
}
