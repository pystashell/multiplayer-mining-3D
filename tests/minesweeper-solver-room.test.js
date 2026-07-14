import test from 'node:test';
import assert from 'node:assert/strict';
import { solveMinesweeperHint } from '../public/minesweeper-solver.js';
import { RoomEngine } from '../worker/room-engine.js';

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function indexOf(config, point) {
  return (point.x * config.height + point.y) * config.depth + point.z;
}

function apply(engine, sequence, command) {
  return engine.apply('host', command, {
    id: `solver-command-${sequence}`,
    sequence,
    now: 10_000 + sequence,
  });
}

test('never labels a real medium-board mine safe or a safe cell as a certain mine', () => {
  let checkedCertainMoves = 0;
  const terminalStates = new Set();

  for (let seed = 1; seed <= 8; seed += 1) {
    const engine = RoomEngine.create({
      code: `SEED${seed}`,
      hostId: 'host',
      hostName: 'Host',
      tokenHash: 'hash',
      mode: 'solo',
      now: 1_000,
    });
    engine.random = seededRandom(seed);
    let sequence = 1;
    apply(engine, sequence++, { op: 'restart', config: { width: 5, height: 5, depth: 5, mineCount: 15 } });
    apply(engine, sequence++, { op: 'dig', x: 2, y: 2, z: 2 });

    for (let step = 0; step < 250 && engine.state.phase === 'playing'; step += 1) {
      const snapshot = engine.snapshot();
      const hint = solveMinesweeperHint({
        ...snapshot.config,
        phase: snapshot.phase,
        revealed: snapshot.revealed,
        flags: snapshot.flags,
        maxMs: 1_000,
      });
      if (hint.status !== 'hint' || hint.certainty !== 'certain') {
        terminalStates.add(hint.status === 'hint' ? hint.certainty : hint.status);
        break;
      }

      const targetIsMine = engine.state.mines.includes(indexOf(snapshot.config, hint.target));
      if (hint.action === 'dig') assert.equal(targetIsMine, false, `seed ${seed}: ${hint.rule} marked a mine safe`);
      else assert.equal(targetIsMine, true, `seed ${seed}: ${hint.rule} marked a safe cell as a mine`);
      checkedCertainMoves += 1;
      apply(engine, sequence++, { op: hint.action, ...hint.target });
    }
    if (engine.state.phase === 'won') terminalStates.add('won');
  }

  assert.ok(checkedCertainMoves >= 20, `expected substantial certain play, got ${checkedCertainMoves} moves`);
  assert.ok([...terminalStates].every((state) => ['guess', 'too-complex', 'won'].includes(state)));
});
