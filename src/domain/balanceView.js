/**
 * The people a balances page shows. An admin sees the whole team; a collaborator only receives
 * themself from the server. In "view as collaborator" mode an admin's page is cut down the same way,
 * so the preview shows exactly what a collaborator would see (the server still answers as admin).
 */
export function employeesInView(employees, { previewAsMember = false, selfId = null } = {}) {
  return previewAsMember ? employees.filter((employee) => employee.id === selfId) : employees;
}
