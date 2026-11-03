import { filterEmployees, STATUS_FILTERS, teamsOf } from '@/domain/employeeFilters';

const employees = [
  { name: 'Ana Prueba', jobTitle: 'Diseñadora', team: 'Diseño', emails: ['ana@effekktive.com'], active: true },
  { name: 'Luis Ejemplo', jobTitle: 'Desarrollador', team: 'Desarrollo', emails: ['luis@gmail.com'], active: true },
  { name: 'Marta Pasada', jobTitle: '', team: 'Diseño', emails: ['marta@x.com'], active: false },
  { name: 'Sin Área', jobTitle: '', team: '', emails: ['sin@x.com'], active: true },
];
const names = (list) => list.map((employee) => employee.name);

describe('filterEmployees', () => {
  it('shows only active people by default', () => {
    expect(names(filterEmployees(employees))).toEqual(['Ana Prueba', 'Luis Ejemplo', 'Sin Área']);
  });

  it('can show the inactive ones or everybody', () => {
    expect(names(filterEmployees(employees, { status: STATUS_FILTERS.INACTIVE }))).toEqual(['Marta Pasada']);
    expect(filterEmployees(employees, { status: STATUS_FILTERS.ALL })).toHaveLength(4);
  });

  it('filters by team', () => {
    expect(names(filterEmployees(employees, { team: 'Diseño', status: 'all' }))).toEqual(['Ana Prueba', 'Marta Pasada']);
  });

  it('searches name, job title and email without caring for accents or case', () => {
    expect(names(filterEmployees(employees, { query: 'DISENADORA' }))).toEqual(['Ana Prueba']);
    expect(names(filterEmployees(employees, { query: 'luis@gmail' }))).toEqual(['Luis Ejemplo']);
    expect(names(filterEmployees(employees, { query: 'sin area' }))).toEqual(['Sin Área']);
  });

  it('combines the filters', () => {
    expect(filterEmployees(employees, { query: 'ana', team: 'Desarrollo' })).toEqual([]);
  });
});

describe('teamsOf', () => {
  it('lists the distinct teams in use, alphabetically, without blanks', () => {
    expect(teamsOf(employees)).toEqual(['Desarrollo', 'Diseño']);
  });
});
