function pointKey(point) {
  return `${point.x}:${point.y}:${point.z}`;
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

export function findChordOpportunity(snapshot) {
  const config = snapshot?.config;
  if (!config || !Array.isArray(snapshot.revealed) || !Array.isArray(snapshot.flags)) return null;

  const revealedKeys = new Set(snapshot.revealed.map(pointKey));
  const flagKeys = new Set(snapshot.flags.map(pointKey));
  const purgedKeys = new Set((snapshot.purged || []).map(pointKey));

  for (const clue of snapshot.revealed) {
    if (!Number.isInteger(clue.count) || clue.count <= 0) continue;
    const neighbors = neighborsOf(clue, config);
    const flaggedAround = neighbors.filter(point => flagKeys.has(pointKey(point))).length;
    const hiddenAround = neighbors.filter((point) => {
      const key = pointKey(point);
      return !purgedKeys.has(key) && !revealedKeys.has(key) && !flagKeys.has(key);
    }).length;
    if (flaggedAround === clue.count && hiddenAround > 0) {
      return { x: clue.x, y: clue.y, z: clue.z, count: clue.count, hiddenAround };
    }
  }

  return null;
}
