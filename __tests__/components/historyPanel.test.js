/** @jest-environment jsdom */
import { render } from '@testing-library/react';
import { HistoryPanel } from '@/components/HistoryPanel';

const mockReload = jest.fn();

jest.mock('@/hooks/useApiData', () => ({
  useApiData: () => ({ data: { movements: [] }, error: null, loading: false, reload: mockReload }),
}));

const employee = (balances) => ({ id: 'e1', name: 'Ana', balances });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HistoryPanel follows the balances', () => {
  it('does not load the history again just because it was drawn', () => {
    render(<HistoryPanel employee={employee({ overtime: 5, vacation: 2 })} />);
    expect(mockReload).not.toHaveBeenCalled();
  });

  it('loads it again when a balance changes (an approved request, a voided movement)', () => {
    const { rerender } = render(<HistoryPanel employee={employee({ overtime: 5, vacation: 2 })} />);

    rerender(<HistoryPanel employee={employee({ overtime: 9, vacation: 2 })} />);

    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('leaves it alone when the same balances come back from another refresh', () => {
    const { rerender } = render(<HistoryPanel employee={employee({ overtime: 5, vacation: 2 })} />);

    rerender(<HistoryPanel employee={employee({ overtime: 5, vacation: 2 })} />);

    expect(mockReload).not.toHaveBeenCalled();
  });
});
