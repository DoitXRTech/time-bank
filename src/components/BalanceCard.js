import es from '../content/es';
import { balanceTone } from '../domain/balances';
import { formatSignedAmount } from '../domain/format';
import { MOVEMENT_TYPE_LIST, MOVEMENT_UNITS } from '../domain/movementTypes';
import { TONE_CLASSES } from './toneClasses';

export function BalanceCard({ employee, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(employee.id)}
      aria-pressed={selected}
      className={`panel text-left transition duration-200 hover:-translate-y-0.5 hover:border-primary ${
        selected ? 'border-primary outline outline-1 outline-primary' : ''
      }`}
    >
      <div className="text-base font-semibold">{employee.name}</div>
      <div className="min-h-[1.25rem] text-xs text-ink-soft">{employee.jobTitle}</div>

      <dl className="mt-3 flex flex-col gap-2 border-t border-divider pt-3">
        {MOVEMENT_TYPE_LIST.map((type) => {
          const value = employee.balances[type];
          return (
            <div key={type} className="flex items-baseline justify-between gap-3">
              <dt className="text-xs text-ink-soft">{es.movementType[type]}</dt>
              <dd className={`num whitespace-nowrap text-sm font-semibold ${TONE_CLASSES[balanceTone(type, value)]}`}>
                {formatSignedAmount(value, MOVEMENT_UNITS[type])}
              </dd>
            </div>
          );
        })}
      </dl>
    </button>
  );
}
