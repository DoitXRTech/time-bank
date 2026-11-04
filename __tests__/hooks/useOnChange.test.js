/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { useOnChange } from '@/hooks/useOnChange';

const setup = (initial) => {
  const onChange = jest.fn();
  const view = renderHook(({ value }) => useOnChange(value, onChange), { initialProps: { value: initial } });
  return { onChange, ...view };
};

describe('useOnChange', () => {
  it('does nothing for the value the screen started with', () => {
    const { onChange } = setup('a');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('calls back when the value changes, once per change', () => {
    const { onChange, rerender } = setup('a');

    rerender({ value: 'b' });
    rerender({ value: 'b' });
    expect(onChange).toHaveBeenCalledTimes(1);

    rerender({ value: 'c' });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('treats the first loaded value as the baseline, not as a change (null means "not loaded yet")', () => {
    const { onChange, rerender } = setup(null);

    rerender({ value: 'id1:pending' });
    expect(onChange).not.toHaveBeenCalled();

    rerender({ value: 'id1:approved' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
