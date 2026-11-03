import { normalizeName, suggestNameMatch } from '@/domain/import/nameMatching';

// Made-up people that reproduce the kinds of differences seen between spreadsheet tabs
const KNOWN = ['Estefania Rojas', 'Josefina Barios', 'Josefina Montero', 'Maria Revolo', 'Yensy Alva', 'Dilan Dejano Uribe', 'Pedro Garcia', 'Marta Garcia'];

describe('normalizeName', () => {
  it('ignores accents, case, punctuation and extra spaces', () => {
    expect(normalizeName('  María  Núñez. ')).toBe('maria nunez');
  });
});

describe('suggestNameMatch', () => {
  it('accepts an identical name as exact, ignoring accents and case', () => {
    expect(suggestNameMatch('ESTEFANÍA rojas', KNOWN)).toMatchObject({ confidence: 'exact', match: 'Estefania Rojas' });
  });

  it('suggests (never decides) a nickname that is the start of the first name', () => {
    expect(suggestNameMatch('Estef', KNOWN)).toMatchObject({ confidence: 'fuzzy', match: 'Estefania Rojas' });
  });

  it('picks the right person among two with the same first name using the surname', () => {
    expect(suggestNameMatch('Josefina Barrios', KNOWN)).toMatchObject({ confidence: 'fuzzy', match: 'Josefina Barios' });
    expect(suggestNameMatch('Josefina Montero', KNOWN).match).toBe('Josefina Montero');
  });

  it('matches a shortened first name when the surname is the same', () => {
    expect(suggestNameMatch('Ria Revolo', KNOWN)).toMatchObject({ confidence: 'fuzzy', match: 'Maria Revolo' });
  });

  it('matches a one-letter typo in the first name', () => {
    expect(suggestNameMatch('Jensy Alva', KNOWN)).toMatchObject({ confidence: 'fuzzy', match: 'Yensy Alva' });
  });

  it('suggests the only person with that first name even if the surname differs', () => {
    expect(suggestNameMatch('Dilan Dario', KNOWN)).toMatchObject({ confidence: 'fuzzy', match: 'Dilan Dejano Uribe' });
  });

  it('is ambiguous when a short name fits two people equally', () => {
    expect(suggestNameMatch('Jos', KNOWN)).toMatchObject({ confidence: 'ambiguous', match: null });
  });

  it('never matches on the surname alone (two people can be relatives)', () => {
    expect(suggestNameMatch('Carlos Garcia', KNOWN)).toMatchObject({ confidence: 'none', match: null });
  });

  it('returns none for an unknown name', () => {
    expect(suggestNameMatch('Zacarias', KNOWN)).toMatchObject({ confidence: 'none', match: null });
  });
});
