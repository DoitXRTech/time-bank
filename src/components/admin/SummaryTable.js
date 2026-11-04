import { useState } from 'react';
import { BalanceAdjustDialog } from './BalanceAdjustDialog';
import es, { interpolate } from '../../content/es';
import { balanceTone } from '../../domain/balances';
import { formatSignedAmount } from '../../domain/format';
import { MOVEMENT_TYPE_LIST, MOVEMENT_UNITS } from '../../domain/movementTypes';
import { Section } from '../Section';
import { TableRowsSkeleton } from '../Skeleton';
import { TONE_CLASSES } from '../toneClasses';

/**
 * Everyone's balances. "Ajustar" opens the dialog that forces a person's balances to what they
 * should be, leaving a note in their history; `onChanged` reloads the data once it is saved.
 */
export function SummaryTable({ employees, loading, onChanged }) {
  // Kept by id: the table refreshes on its own, and the dialog should compare with what the person has now
  const [adjustingId, setAdjustingId] = useState(null);
  const adjusting = employees.find((employee) => employee.id === adjustingId);

  function handleSaved() {
    setAdjustingId(null);
    onChanged();
  }

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
              <th className="th" />
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
                <td className="py-2.5 text-right">
                  <button
                    type="button"
                    className="btn-ghost !min-h-[36px] !rounded-[6px] !px-3 !text-xs"
                    aria-label={interpolate(es.admin.adjust.buttonLabel, { name: employee.name })}
                    disabled={!employee.active}
                    onClick={() => setAdjustingId(employee.id)}
                  >
                    {es.admin.adjust.button}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {adjusting && <BalanceAdjustDialog employee={adjusting} onSaved={handleSaved} onCancel={() => setAdjustingId(null)} />}
    </Section>
  );
}
