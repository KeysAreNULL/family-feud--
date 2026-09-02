export function sortAnswersByPoints(answers) {
  return [...answers].sort((a, b) => {
    if (Number(b.count) !== Number(a.count)) {
      return Number(b.count) - Number(a.count);
    }
    return String(a.text).localeCompare(String(b.text));
  });
}

export function getWinningTeamIndex(scores) {
  if (!scores.length) {
    return { winnerIndex: null, tie: false, winningScore: 0, tiedIndexes: [] };
  }

  const maxScore = Math.max(...scores);
  const tiedIndexes = scores
    .map((score, index) => (score === maxScore ? index : -1))
    .filter(index => index >= 0);

  if (tiedIndexes.length > 1) {
    return {
      winnerIndex: null,
      tie: true,
      winningScore: maxScore,
      tiedIndexes,
    };
  }

  return {
    winnerIndex: tiedIndexes[0] ?? null,
    tie: false,
    winningScore: maxScore,
    tiedIndexes,
  };
}
