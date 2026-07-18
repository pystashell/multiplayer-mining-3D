function pointKey(point) {
  return `${point.x}:${point.y}:${point.z}`;
}

function comparePoints(left, right) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function neighborsOf(point, config) {
  const neighbors = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const x = point.x + dx;
        const y = point.y + dy;
        const z = point.z + dz;
        if (x < 0 || y < 0 || z < 0 || x >= config.width || y >= config.height || z >= config.depth) continue;
        neighbors.push({ x, y, z });
      }
    }
  }
  return neighbors;
}

function chordContext(snapshot) {
  const config = snapshot?.config;
  if (!config || !Array.isArray(snapshot?.revealed) || !Array.isArray(snapshot?.flags)) return null;

  const revealedByKey = new Map(snapshot.revealed.map((point) => [pointKey(point), point]));
  return {
    config,
    revealedByKey,
    revealedKeys: new Set(revealedByKey.keys()),
    flagKeys: new Set(snapshot.flags.map(pointKey)),
    purgedKeys: new Set((Array.isArray(snapshot.purged) ? snapshot.purged : []).map(pointKey)),
  };
}

function opportunityAtContext(context, target) {
  if (!context || !target) return null;
  const clue = context.revealedByKey.get(pointKey(target));
  if (!clue || !Number.isInteger(clue.count) || clue.count <= 0) return null;

  let flaggedAround = 0;
  let hiddenAround = 0;
  for (const point of neighborsOf(clue, context.config)) {
    const key = pointKey(point);
    if (context.flagKeys.has(key)) flaggedAround += 1;
    else if (!context.purgedKeys.has(key) && !context.revealedKeys.has(key)) hiddenAround += 1;
  }
  if (flaggedAround !== clue.count || hiddenAround <= 0) return null;
  return { x: clue.x, y: clue.y, z: clue.z, count: clue.count, hiddenAround };
}

export function chordOpportunityAt(snapshot, target) {
  return opportunityAtContext(chordContext(snapshot), target);
}

export function findChordOpportunity(snapshot) {
  const context = chordContext(snapshot);
  if (!context) return null;
  const clues = [...context.revealedByKey.values()].sort(comparePoints);
  for (const clue of clues) {
    const opportunity = opportunityAtContext(context, clue);
    if (opportunity) return opportunity;
  }
  return null;
}

export function findNewChordOpportunity(snapshot, previous) {
  const currentContext = chordContext(snapshot);
  const previousContext = chordContext(previous);
  if (!currentContext || !previousContext) return null;
  if (
    currentContext.config.width !== previousContext.config.width
    || currentContext.config.height !== previousContext.config.height
    || currentContext.config.depth !== previousContext.config.depth
  ) return null;

  const addedFlags = [...currentContext.flagKeys]
    .filter((key) => !previousContext.flagKeys.has(key))
    .map((key) => {
      const [x, y, z] = key.split(':').map(Number);
      return { x, y, z };
    })
    .sort(comparePoints);
  if (!addedFlags.length) return null;

  const candidateClues = new Map();
  for (const flag of addedFlags) {
    for (const neighbor of neighborsOf(flag, currentContext.config)) {
      const clue = currentContext.revealedByKey.get(pointKey(neighbor));
      if (clue) candidateClues.set(pointKey(clue), clue);
    }
  }

  for (const clue of [...candidateClues.values()].sort(comparePoints)) {
    const current = opportunityAtContext(currentContext, clue);
    if (!current) continue;
    if (opportunityAtContext(previousContext, clue)) continue;
    return current;
  }
  return null;
}

export function isNewSuccessfulChord(snapshot, previous) {
  const reveal = snapshot?.lastReveal;
  return Boolean(
    reveal?.id
    && reveal.kind === 'chord'
    && reveal.id !== previous?.lastReveal?.id
  );
}
