import assert from 'node:assert/strict';
import { getWinningTeamIndex, sortAnswersByPoints } from './gameLogic.js';

const winner = getWinningTeamIndex([18, 18, 10]);
assert.equal(winner.tie, true, 'should report a tie when scores match');
assert.equal(winner.winnerIndex, null, 'tied rounds should not pick a single winner');

const leader = getWinningTeamIndex([12, 20, 20]);
assert.equal(leader.tie, true, 'two teams tied for the lead should be reported as tie');
assert.equal(leader.winnerIndex, null, 'tie should not produce a winner index');

const winnerTeam = getWinningTeamIndex([12, 25, 8]);
assert.equal(winnerTeam.winnerIndex, 1, 'highest score should win the round');

const ordered = sortAnswersByPoints([
  { id: 1, text: 'Bananas', count: 8 },
  { id: 2, text: 'Apples', count: 28 },
  { id: 3, text: 'Oranges', count: 14 },
]);
assert.deepEqual(ordered.map((a) => a.id), [2, 3, 1], 'answers should be sorted highest to lowest');

console.log('game logic checks passed');
