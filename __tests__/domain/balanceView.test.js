import { employeesInView } from '@/domain/balanceView';

const team = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('employeesInView', () => {
  it('shows the whole list normally', () => {
    expect(employeesInView(team, { selfId: 'a' })).toEqual(team);
  });

  it('in view-as-collaborator mode shows only the signed-in person', () => {
    expect(employeesInView(team, { previewAsMember: true, selfId: 'b' })).toEqual([{ id: 'b' }]);
  });

  it('shows nobody in preview mode when the person is not in the list', () => {
    expect(employeesInView(team, { previewAsMember: true, selfId: 'zzz' })).toEqual([]);
  });
});
