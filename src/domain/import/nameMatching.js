const MIN_AFFIX_LENGTH = 3;
// Needed so "Steph" can match "Stephanie" without ever matching two different people at once
const FUZZY_MATCH_MIN_SCORE = 0.7;

export function normalizeName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previousDiagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const previousRow = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previousDiagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      previousDiagonal = previousRow;
    }
  }
  return row[b.length];
}

/** 1 identical, 0.8 one typo, 0.7 one is the start or the end of the other ("steph"/"stephanie") */
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= MIN_AFFIX_LENGTH && (a.startsWith(b) || b.startsWith(a) || a.endsWith(b) || b.endsWith(a))) {
    return 0.7;
  }
  if (a.length >= 4 && b.length >= 4 && editDistance(a, b) === 1) return 0.8;
  return 0;
}

/**
 * Name similarity: the first name must resemble the candidate's (two people can share a
 * surname), and a resembling surname adds to the score when both names have one.
 */
function scoreCandidate(rawTokens, candidateTokens) {
  const firstScore = tokenSimilarity(rawTokens[0], candidateTokens[0]);
  if (firstScore === 0 || rawTokens.length === 1) return firstScore;

  const rawSurname = rawTokens[rawTokens.length - 1];
  const surnameScore = Math.max(0, ...candidateTokens.slice(1).map((token) => tokenSimilarity(rawSurname, token)));
  return firstScore + surnameScore;
}

/**
 * Suggests which known person a name from another tab refers to.
 * Never decides on its own for anything but an identical name: fuzzy results are suggestions
 * for a human to confirm in the mapping file.
 *
 * @param {string} rawName name as written in the tab
 * @param {string[]} knownNames full names (from the vacations tab)
 * @returns {{ confidence: 'exact'|'fuzzy'|'ambiguous'|'none', match: string|null, candidates: string[] }}
 */
export function suggestNameMatch(rawName, knownNames) {
  const rawNormalized = normalizeName(rawName);
  const exact = knownNames.find((name) => normalizeName(name) === rawNormalized);
  if (exact) return { confidence: 'exact', match: exact, candidates: [exact] };

  const rawTokens = rawNormalized.split(' ').filter(Boolean);
  if (!rawTokens.length) return { confidence: 'none', match: null, candidates: [] };

  const scored = knownNames
    .map((name) => ({ name, score: scoreCandidate(rawTokens, normalizeName(name).split(' ')) }))
    .filter(({ score }) => score >= FUZZY_MATCH_MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { confidence: 'none', match: null, candidates: [] };

  const candidates = scored.map(({ name }) => name);
  const isTie = scored.length > 1 && scored[0].score === scored[1].score;
  if (isTie) return { confidence: 'ambiguous', match: null, candidates };

  return { confidence: 'fuzzy', match: scored[0].name, candidates };
}
