import es from '../../content/es';
import { balanceTone } from '../../domain/balances';
import { formatSignedAmount } from '../../domain/format';
import { MOVEMENT_TYPE_LIST, MOVEMENT_UNITS } from '../../domain/movementTypes';
import { Section } from '../Section';
import { TableRowsSkeleton } from '../Skeleton';
import { TONE_CLASSES } from '../toneClasses';

export function SummaryTable({ employees, loading }) {
  return (
    <Section title={es.admin.summaryTitle}>
      {loading && !employees.length && <TableRowsSkeleton rows={5} />}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-divider">
              <th className="th">{es.admin.summaryEmployee}</th>
              {MOVEMENT_TYPE_LIST.map((type) => (
                <th key={type} className="th">
                  {es.movementType[type]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="reveal-rows">
            {employees.map((employee) => (
              <tr key={employee.id} className={`border-b border-divider last:border-b-0 ${employee.active ? '' : 'opacity-50'}`}>
                <td className="py-2.5 pr-3">
                  {employee.name} {!employee.active && es.admin.inactiveSuffix}
                </td>
                {MOVEMENT_TYPE_LIST.map((type) => (
                  <td
                    key={type}
                    className={`num whitespace-nowrap py-2.5 pr-3 font-semibold ${TONE_CLASSES[balanceTone(type, employee.balances[type])]}`}
                  >
                    {formatSignedAmount(employee.balances[type], MOVEMENT_UNITS[type])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
