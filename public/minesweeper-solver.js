export function pointKey(point) {
  return `${point.x}:${point.y}:${point.z}`;
}

function compareKeys(left, right) {
  const [lx, ly, lz] = left.split(':').map(Number);
  const [rx, ry, rz] = right.split(':').map(Number);
  return lx - rx || ly - ry || lz - rz;
}

function pointFromKey(key) {
  const [x, y, z] = key.split(':').map(Number);
  return { x, y, z };
}

function peripheralRank(key, dimensions) {
  if (!dimensions) return null;
  const { width, height, depth } = dimensions;
  const { x, y, z } = pointFromKey(key);
  const faceDistances = [x, width - 1 - x, y, height - 1 - y, z, depth - 1 - z];
  return {
    shell: Math.min(...faceDistances),
    boundaryFaces: faceDistances.filter((distance) => distance === 0).length,
    cameraSide: x + y + z,
  };
}

function comparePeripheralKeys(left, right, dimensions) {
  const leftRank = peripheralRank(left, dimensions);
  const rightRank = peripheralRank(right, dimensions);
  if (!leftRank || !rightRank) return compareKeys(left, right);
  return leftRank.shell - rightRank.shell
    || rightRank.boundaryFaces - leftRank.boundaryFaces
    || rightRank.cameraSide - leftRank.cameraSide
    || compareKeys(left, right);
}

function allPoints(width, height, depth) {
  const result = [];
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let z = 0; z < depth; z += 1) result.push({ x, y, z });
    }
  }
  return result;
}

function neighborsOf(point, width, height, depth) {
  const result = [];
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const next = { x: point.x + dx, y: point.y + dy, z: point.z + dz };
        if (next.x >= 0 && next.x < width && next.y >= 0 && next.y < height && next.z >= 0 && next.z < depth) result.push(next);
      }
    }
  }
  return result;
}

function chooseTargetKey(keys, dimensions = null) {
  return [...keys].sort((left, right) => comparePeripheralKeys(left, right, dimensions))[0];
}

function chooseTarget(keys, dimensions = null) {
  return pointFromKey(chooseTargetKey(keys, dimensions));
}

function isSubset(left, rightSet) {
  return left.every((key) => rightSet.has(key));
}

function clueDetails(constraint, source = constraint.sources[0]) {
  return {
    source: { x: source.x, y: source.y, z: source.z, count: source.count },
    number: source.count,
    flagged: constraint.flagged,
    hidden: constraint.cells.length,
    remaining: constraint.required,
    unknownCells: constraint.cells.map(pointFromKey),
  };
}

function labelClues(clues) {
  return clues.map((clue, index) => ({ ...clue, id: String.fromCharCode(65 + index) }));
}

function findCoverInference(constraints, dimensions, preferMines = false) {
  const moves = [];
  for (const upper of constraints) {
    const lowers = constraints.filter((candidate) => candidate !== upper
      && candidate.cells.length < upper.cells.length
      && isSubset(candidate.cells, upper.cellSet));

    const visit = (start, selected, covered, coveredMines) => {
      if (selected.length >= 2) {
        const difference = upper.cells.filter((key) => !covered.has(key));
        const differenceMines = upper.required - coveredMines;
        if (difference.length > 0
          && (differenceMines === 0 || differenceMines === difference.length)) {
          moves.push({ upper, lowers: [...selected], difference, differenceMines, covered: [...covered] });
        }
      }
      if (selected.length === 4) return;

      for (let index = start; index < lowers.length; index += 1) {
        const lower = lowers[index];
        if (lower.cells.some((key) => covered.has(key))) continue;
        const nextMines = coveredMines + lower.required;
        if (nextMines > upper.required) continue;
        const nextCovered = new Set(covered);
        for (const key of lower.cells) nextCovered.add(key);
        visit(index + 1, [...selected, lower], nextCovered, nextMines);
      }
    };
    visit(0, [], new Set(), 0);
  }

  moves.sort((left, right) => {
    const leftSafe = left.differenceMines === 0;
    const rightSafe = right.differenceMines === 0;
    const leftPreferred = preferMines ? !leftSafe : leftSafe;
    const rightPreferred = preferMines ? !rightSafe : rightSafe;
    return Number(rightPreferred) - Number(leftPreferred)
      || left.lowers.length - right.lowers.length
      || left.difference.length - right.difference.length
      || comparePeripheralKeys(chooseTargetKey(left.difference, dimensions), chooseTargetKey(right.difference, dimensions), dimensions);
  });
  const move = moves[0];
  if (!move) return null;

  const safe = move.differenceMines === 0;
  const [upperClue, ...lowerClues] = labelClues([
    clueDetails(move.upper),
    ...move.lowers.map((lower) => clueDetails(lower)),
  ]);
  const coveredMines = move.lowers.reduce((total, lower) => total + lower.required, 0);
  const proof = {
    kind: 'set-cover',
    clues: [upperClue, ...lowerClues],
    relations: [
      ...lowerClues.map((clue) => ({ kind: 'subset', subset: clue.id, superset: upperClue.id })),
      { kind: 'pairwise-disjoint', clues: lowerClues.map((clue) => clue.id) },
      {
        kind: 'subtract-covered',
        from: upperClue.id,
        subtract: lowerClues.map((clue) => clue.id),
        coveredMines,
        otherHidden: move.difference.length,
        otherRemaining: move.differenceMines,
      },
    ],
    conclusion: {
      differenceCells: move.difference.map(pointFromKey),
      differenceMines: move.differenceMines,
      targetValue: safe ? 'safe' : 'mine',
    },
  };
  return {
    action: safe ? 'dig' : 'flag',
    certainty: 'certain',
    rule: safe ? 'cover-safe' : 'cover-mine',
    target: chooseTarget(move.difference, dimensions),
    evidence: proof.clues.map((clue) => clue.source),
    details: {
      upperNumber: upperClue.number,
      upperFlagged: upperClue.flagged,
      upperHidden: upperClue.hidden,
      upperRemaining: upperClue.remaining,
      coveredHidden: move.covered.length,
      coveredMines,
      difference: move.difference.length,
      differenceMines: move.differenceMines,
      proof,
    },
  };
}

export function buildConstraints({ width, height, depth, revealed = [], flags = [], excluded = [] }) {
  const excludedKeys = new Set(excluded.map(pointKey));
  const revealedByKey = new Map(revealed.map((cell) => [pointKey(cell), cell]));
  const flagKeys = new Set(flags.map(pointKey));
  const hidden = allPoints(width, height, depth)
    .map(pointKey)
    .filter((key) => !excludedKeys.has(key) && !revealedByKey.has(key) && !flagKeys.has(key))
    .sort(compareKeys);
  const hiddenSet = new Set(hidden);
  const constraints = [];
  const seen = new Map();

  for (const cell of revealed) {
    const neighbors = neighborsOf(cell, width, height, depth);
    const cells = neighbors.map(pointKey).filter((key) => hiddenSet.has(key)).sort(compareKeys);
    const flagged = neighbors.reduce((total, point) => total + Number(flagKeys.has(pointKey(point))), 0);
    const required = cell.count - flagged;
    if (required < 0 || required > cells.length) {
      return { inconsistent: true, hidden, constraints: [], reason: 'constraint-conflict' };
    }
    if (!cells.length) {
      if (required !== 0) return { inconsistent: true, hidden, constraints: [], reason: 'constraint-conflict' };
      continue;
    }
    const signature = cells.join('|');
    const existing = seen.get(signature);
    if (existing) {
      if (existing.required !== required) return { inconsistent: true, hidden, constraints: [], reason: 'constraint-conflict' };
      existing.sources.push({ x: cell.x, y: cell.y, z: cell.z, count: cell.count });
      continue;
    }
    const constraint = {
      cells,
      cellSet: new Set(cells),
      required,
      flagged,
      sources: [{ x: cell.x, y: cell.y, z: cell.z, count: cell.count }],
    };
    seen.set(signature, constraint);
    constraints.push(constraint);
  }

  return { inconsistent: false, hidden, constraints };
}

function directInference(constraint, action, dimensions) {
  const source = constraint.sources[0];
  return {
    action,
    certainty: 'certain',
    rule: action === 'dig' ? 'direct-safe' : 'direct-mine',
    target: chooseTarget(constraint.cells, dimensions),
    evidence: [source],
    details: {
      number: source.count,
      flagged: constraint.flagged,
      hidden: constraint.cells.length,
      remaining: constraint.required,
    },
  };
}

export function findDeterministicInference(constraints, dimensions = null, { preferMines = false } = {}) {
  const ordered = [...constraints].sort((left, right) => left.cells.length - right.cells.length
    || left.required - right.required
    || comparePeripheralKeys(chooseTargetKey(left.cells, dimensions), chooseTargetKey(right.cells, dimensions), dimensions));
  const directSafe = ordered.find((constraint) => constraint.required === 0);
  const directMine = ordered.find((constraint) => constraint.required === constraint.cells.length);
  if (!preferMines && directSafe) return directInference(directSafe, 'dig', dimensions);
  if (directMine) return directInference(directMine, 'flag', dimensions);

  const subsetMoves = [];
  for (const lower of ordered) {
    for (const upper of ordered) {
      if (lower === upper || lower.cells.length >= upper.cells.length || !isSubset(lower.cells, upper.cellSet)) continue;
      const difference = upper.cells.filter((key) => !lower.cellSet.has(key));
      const differenceMines = upper.required - lower.required;
      if (differenceMines < 0 || differenceMines > difference.length) continue;
      if (differenceMines !== 0 && differenceMines !== difference.length) continue;
      subsetMoves.push({ lower, upper, difference, differenceMines });
    }
  }
  subsetMoves.sort((left, right) => {
    const leftSafe = left.differenceMines === 0;
    const rightSafe = right.differenceMines === 0;
    const leftPreferred = preferMines ? !leftSafe : leftSafe;
    const rightPreferred = preferMines ? !rightSafe : rightSafe;
    return Number(rightPreferred) - Number(leftPreferred)
      || left.difference.length - right.difference.length
      || comparePeripheralKeys(chooseTargetKey(left.difference, dimensions), chooseTargetKey(right.difference, dimensions), dimensions);
  });
  const move = subsetMoves[0];
  const subsetHint = move ? (() => {
    const lowerSource = move.lower.sources[0];
    const upperSource = move.upper.sources[0];
    const safe = move.differenceMines === 0;
    return {
      action: safe ? 'dig' : 'flag',
      certainty: 'certain',
      rule: safe ? 'subset-safe' : 'subset-mine',
      target: chooseTarget(move.difference, dimensions),
      evidence: [lowerSource, upperSource],
      details: {
        lowerNumber: lowerSource.count,
        lowerRemaining: move.lower.required,
        lowerHidden: move.lower.cells.length,
        upperNumber: upperSource.count,
        upperRemaining: move.upper.required,
        upperHidden: move.upper.cells.length,
        difference: move.difference.length,
        differenceMines: move.differenceMines,
      },
    };
  })() : null;
  if (!preferMines) return subsetHint || findCoverInference(ordered, dimensions);
  if (subsetHint?.action === 'flag') return subsetHint;
  const coverHint = findCoverInference(ordered, dimensions, true);
  if (coverHint?.action === 'flag') return coverHint;
  if (directSafe) return directInference(directSafe, 'dig', dimensions);
  return subsetHint || coverHint;
}

function buildComponents(constraints) {
  const frontier = [...new Set(constraints.flatMap((constraint) => constraint.cells))].sort(compareKeys);
  const constraintIdsByCell = new Map(frontier.map((key) => [key, []]));
  constraints.forEach((constraint, index) => {
    for (const key of constraint.cells) constraintIdsByCell.get(key)?.push(index);
  });
  const visitedCells = new Set();
  const components = [];
  for (const start of frontier) {
    if (visitedCells.has(start)) continue;
    const cells = new Set([start]);
    const constraintIds = new Set();
    const queue = [start];
    visitedCells.add(start);
    while (queue.length) {
      const key = queue.shift();
      for (const constraintId of constraintIdsByCell.get(key) || []) {
        if (constraintIds.has(constraintId)) continue;
        constraintIds.add(constraintId);
        for (const neighborKey of constraints[constraintId].cells) {
          if (visitedCells.has(neighborKey)) continue;
          visitedCells.add(neighborKey);
          cells.add(neighborKey);
          queue.push(neighborKey);
        }
      }
    }
    components.push({
      cells: [...cells].sort(compareKeys),
      constraints: [...constraintIds].map((index) => constraints[index]),
    });
  }
  return { frontier, components };
}

function minFillOrder(component) {
  const cellIndex = new Map(component.cells.map((key, index) => [key, index]));
  const adjacency = component.cells.map(() => new Set());
  for (const constraint of component.constraints) {
    const variables = constraint.cells.map((key) => cellIndex.get(key));
    for (let left = 0; left < variables.length; left += 1) {
      for (let right = left + 1; right < variables.length; right += 1) {
        adjacency[variables[left]].add(variables[right]);
        adjacency[variables[right]].add(variables[left]);
      }
    }
  }

  const remaining = new Set(component.cells.map((_, index) => index));
  const order = [];
  while (remaining.size) {
    let best = null;
    for (const variable of remaining) {
      const neighbors = [...adjacency[variable]].filter((index) => remaining.has(index));
      let fill = 0;
      for (let left = 0; left < neighbors.length; left += 1) {
        for (let right = left + 1; right < neighbors.length; right += 1) {
          if (!adjacency[neighbors[left]].has(neighbors[right])) fill += 1;
        }
      }
      const candidate = { variable, neighbors, fill };
      if (!best || candidate.fill < best.fill
        || (candidate.fill === best.fill && candidate.neighbors.length < best.neighbors.length)
        || (candidate.fill === best.fill && candidate.neighbors.length === best.neighbors.length && candidate.variable < best.variable)) {
        best = candidate;
      }
    }
    for (let left = 0; left < best.neighbors.length; left += 1) {
      for (let right = left + 1; right < best.neighbors.length; right += 1) {
        adjacency[best.neighbors[left]].add(best.neighbors[right]);
        adjacency[best.neighbors[right]].add(best.neighbors[left]);
      }
    }
    remaining.delete(best.variable);
    order.push(best.variable);
  }
  return order;
}

function addPolynomialValue(polynomial, mines, ways) {
  polynomial.set(mines, (polynomial.get(mines) || 0n) + ways);
}

function enumerateComponent(component, budget, maxMines) {
  const originalIndex = new Map(component.cells.map((key, index) => [key, index]));
  const order = minFillOrder(component);
  const positionByOriginal = new Map(order.map((index, position) => [index, position]));
  const constraints = component.constraints.map((constraint) => ({
    variables: constraint.cells.map((key) => positionByOriginal.get(originalIndex.get(key))).sort((a, b) => a - b),
    required: constraint.required,
  }));
  const memberships = component.cells.map(() => []);
  constraints.forEach((constraint, constraintIndex) => {
    for (const position of constraint.variables) memberships[position].push(constraintIndex);
  });
  const remainingAfter = constraints.map((constraint) => {
    const counts = new Int16Array(component.cells.length);
    let cursor = constraint.variables.length - 1;
    for (let position = component.cells.length - 1; position >= 0; position -= 1) {
      while (cursor >= 0 && constraint.variables[cursor] > position) cursor -= 1;
      counts[position] = constraint.variables.length - cursor - 1;
    }
    return counts;
  });
  const statesByPosition = component.cells.map(() => []);
  const memo = new Map();
  let incomplete = false;

  const compute = (position, required) => {
    if (incomplete) return null;
    budget.nodes += 1;
    if (budget.nodes > budget.maxNodes || Date.now() > budget.deadline) {
      incomplete = true;
      return null;
    }
    if (position === component.cells.length) return { position, ways: new Map([[0, 1n]]), transitions: [] };
    const key = `${position}|${required.join(',')}`;
    const cached = memo.get(key);
    if (cached) return cached;
    const state = { position, ways: new Map(), transitions: [] };
    memo.set(key, state);
    statesByPosition[position].push(state);
    for (const value of [0, 1]) {
      const nextRequired = new Int16Array(required);
      let valid = true;
      for (const constraintIndex of memberships[position]) {
        nextRequired[constraintIndex] -= value;
        if (nextRequired[constraintIndex] < 0 || nextRequired[constraintIndex] > remainingAfter[constraintIndex][position]) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
      const child = compute(position + 1, nextRequired);
      if (!child) return null;
      state.transitions.push({ value, child });
      for (const [childMines, ways] of child.ways) {
        const mines = childMines + value;
        if (mines <= maxMines) addPolynomialValue(state.ways, mines, ways);
      }
    }
    return state;
  };

  const initialRequired = Int16Array.from(constraints, (constraint) => constraint.required);
  const root = compute(0, initialRequired);
  if (incomplete || !root) return { ...component, incomplete: true };

  const mineWaysMaps = component.cells.map(() => new Map());
  let prefixes = new Map([[root, new Map([[0, 1n]])]]);
  for (let position = 0; position < component.cells.length; position += 1) {
    const nextPrefixes = new Map();
    for (const state of statesByPosition[position]) {
      const prefix = prefixes.get(state);
      if (!prefix) continue;
      for (const { value, child } of state.transitions) {
        let childPrefix = nextPrefixes.get(child);
        if (!childPrefix) {
          childPrefix = new Map();
          nextPrefixes.set(child, childPrefix);
        }
        for (const [prefixMines, prefixWays] of prefix) {
          const mines = prefixMines + value;
          if (mines <= maxMines) addPolynomialValue(childPrefix, mines, prefixWays);
          if (value !== 1) continue;
          for (const [suffixMines, suffixWays] of child.ways) {
            const totalMines = mines + suffixMines;
            if (totalMines <= maxMines) addPolynomialValue(mineWaysMaps[order[position]], totalMines, prefixWays * suffixWays);
          }
        }
      }
    }
    prefixes = nextPrefixes;
    if (Date.now() > budget.deadline) return { ...component, incomplete: true };
  }

  const waysByMines = Array(component.cells.length + 1).fill(0n);
  for (const [mines, ways] of root.ways) waysByMines[mines] = ways;
  const mineWaysByCell = mineWaysMaps.map((mineWays) => {
    const values = Array(component.cells.length + 1).fill(0n);
    for (const [mines, ways] of mineWays) values[mines] = ways;
    return values;
  });
  return { ...component, waysByMines, mineWaysByCell, incomplete: false };
}

function combinations(n, k) {
  if (k < 0 || k > n) return 0n;
  let result = 1n;
  const count = Math.min(k, n - k);
  for (let index = 1; index <= count; index += 1) result = result * BigInt(n - count + index) / BigInt(index);
  return result;
}

function distributionFromWays(ways) {
  const result = new Map();
  ways.forEach((count, mines) => {
    if (count) result.set(mines, count);
  });
  return result;
}

function convolve(left, right) {
  const result = new Map();
  for (const [leftMines, leftWays] of left) {
    for (const [rightMines, rightWays] of right) {
      const mines = leftMines + rightMines;
      result.set(mines, (result.get(mines) || 0n) + leftWays * rightWays);
    }
  }
  return result;
}

function ratio(numerator, denominator) {
  if (!denominator) return 1;
  return Number(numerator * 1_000_000n / denominator) / 1_000_000;
}

function exactProbabilities({ constraints, hidden, remainingMines, maxNodes, maxMs }) {
  const { frontier, components } = buildComponents(constraints);
  const frontierSet = new Set(frontier);
  const outside = hidden.filter((key) => !frontierSet.has(key));
  const budget = { nodes: 0, maxNodes, deadline: Date.now() + maxMs };
  const enumerated = [];
  for (const component of components) {
    const result = enumerateComponent(component, budget, remainingMines);
    if (result.incomplete) return { incomplete: true, nodes: budget.nodes };
    enumerated.push(result);
  }

  const prefix = [new Map([[0, 1n]])];
  for (const component of enumerated) prefix.push(convolve(prefix.at(-1), distributionFromWays(component.waysByMines)));
  const suffix = Array(enumerated.length + 1);
  suffix[enumerated.length] = new Map([[0, 1n]]);
  for (let index = enumerated.length - 1; index >= 0; index -= 1) {
    suffix[index] = convolve(distributionFromWays(enumerated[index].waysByMines), suffix[index + 1]);
  }

  const frontierDistribution = prefix.at(-1);
  let totalWays = 0n;
  for (const [frontierMines, ways] of frontierDistribution) {
    totalWays += ways * combinations(outside.length, remainingMines - frontierMines);
  }
  if (!totalWays) return { inconsistent: true, nodes: budget.nodes };

  const probabilities = [];
  for (let componentIndex = 0; componentIndex < enumerated.length; componentIndex += 1) {
    const component = enumerated[componentIndex];
    const otherDistribution = convolve(prefix[componentIndex], suffix[componentIndex + 1]);
    for (let cellIndex = 0; cellIndex < component.cells.length; cellIndex += 1) {
      let mineWays = 0n;
      component.mineWaysByCell[cellIndex].forEach((localMineWays, localMines) => {
        if (!localMineWays) return;
        for (const [otherMines, otherWays] of otherDistribution) {
          const outsideMines = remainingMines - localMines - otherMines;
          mineWays += localMineWays * otherWays * combinations(outside.length, outsideMines);
        }
      });
      probabilities.push({
        key: component.cells[cellIndex],
        numerator: mineWays,
        denominator: totalWays,
        probability: ratio(mineWays, totalWays),
        frontier: true,
      });
    }
  }

  if (outside.length) {
    let outsideMineWeight = 0n;
    for (const [frontierMines, ways] of frontierDistribution) {
      const outsideMines = remainingMines - frontierMines;
      outsideMineWeight += ways * combinations(outside.length, outsideMines) * BigInt(Math.max(0, outsideMines));
    }
    const outsideDenominator = totalWays * BigInt(outside.length);
    for (const key of outside) {
      probabilities.push({
        key,
        numerator: outsideMineWeight,
        denominator: outsideDenominator,
        probability: ratio(outsideMineWeight, outsideDenominator),
        frontier: false,
      });
    }
  }

  return { incomplete: false, inconsistent: false, totalWays, probabilities, nodes: budget.nodes, constraints, frontierSet };
}

function evidenceForTarget(targetKey, constraints) {
  return constraints
    .filter((constraint) => constraint.cellSet.has(targetKey))
    .flatMap((constraint) => constraint.sources.slice(0, 1))
    .slice(0, 4);
}

function enumerationEvidence(targetKey, constraints, assumption, validWays) {
  const pending = [...constraints];
  const keyConstraints = [];
  const connectedCells = new Set([targetKey]);
  while (pending.length && keyConstraints.length < 4) {
    const index = pending.findIndex((constraint) => constraint.cells.some((key) => connectedCells.has(key)));
    if (index < 0) break;
    const [constraint] = pending.splice(index, 1);
    keyConstraints.push(constraint);
    for (const key of constraint.cells) connectedCells.add(key);
  }
  const clues = keyConstraints.map((constraint) => {
    const clue = clueDetails(constraint);
    const containsTarget = constraint.cellSet.has(targetKey);
    return {
      ...clue,
      containsTarget,
      otherHidden: clue.hidden - Number(containsTarget),
      otherRemaining: clue.remaining - Number(containsTarget && assumption === 'mine'),
    };
  });
  return {
    evidence: clues.map((clue) => clue.source),
    proof: {
      kind: 'contradiction-enumeration',
      clueScope: 'key-constraints',
      assumption,
      oppositeWays: '0',
      validWays: validWays.toString(),
      clues,
    },
  };
}

function boundedGuess(hidden, constraints, remainingMines, nodes, dimensions) {
  const globalDensity = hidden.length ? remainingMines / hidden.length : 1;
  const candidates = hidden.map((key) => {
    const related = constraints.filter((constraint) => constraint.cellSet.has(key));
    const densities = related.map((constraint) => constraint.required / constraint.cells.length);
    const localDensity = densities.length
      ? densities.reduce((total, density) => total + density, 0) / densities.length
      : globalDensity;
    return { key, related, localDensity };
  });
  candidates.sort((left, right) => left.localDensity - right.localDensity
    || comparePeripheralKeys(left.key, right.key, dimensions)
    || Number(Boolean(right.related.length)) - Number(Boolean(left.related.length))
    || compareKeys(left.key, right.key));
  const candidate = candidates[0];
  const representative = [...candidate.related].sort((left, right) => {
    const leftDensity = left.required / left.cells.length;
    const rightDensity = right.required / right.cells.length;
    return leftDensity - rightDensity || left.cells.length - right.cells.length;
  })[0];
  return {
    status: 'hint',
    action: 'dig',
    certainty: 'guess',
    rule: 'bounded-guess',
    target: pointFromKey(candidate.key),
    evidence: evidenceForTarget(candidate.key, constraints),
    details: {
      nodes,
      localDensity: candidate.localDensity,
      globalDensity,
      remaining: representative?.required ?? remainingMines,
      hidden: representative?.cells.length ?? hidden.length,
    },
  };
}

export function solveMinesweeperHint({
  width,
  height,
  depth,
  mineCount,
  phase,
  revealed = [],
  flags = [],
  excluded = [],
  maxNodes = 2_000_000,
  maxMs = 180,
  preferMines = false,
}) {
  const knowledge = buildConstraints({ width, height, depth, revealed, flags, excluded });
  if (knowledge.inconsistent || mineCount - flags.length < 0) return { status: 'inconsistent', rule: 'inconsistent', target: null, evidence: [] };
  if (!knowledge.hidden.length) return { status: 'complete', rule: 'complete', target: null, evidence: [] };

  if (phase === 'ready') {
    const target = chooseTarget(knowledge.hidden, { width, height, depth });
    return { status: 'hint', action: 'dig', certainty: 'certain', rule: 'first-move', target, evidence: [], details: {} };
  }

  const dimensions = { width, height, depth };
  const deterministic = findDeterministicInference(knowledge.constraints, dimensions, { preferMines });
  const deterministicSafeFallback = preferMines && deterministic?.action === 'dig' ? deterministic : null;
  if (deterministic && !deterministicSafeFallback) return { status: 'hint', ...deterministic };

  const remainingMines = mineCount - flags.length;
  if (!knowledge.constraints.length) {
    const totalWays = combinations(knowledge.hidden.length, remainingMines);
    if (!totalWays) return { status: 'inconsistent', rule: 'inconsistent', target: null, evidence: [] };
    const target = chooseTarget(knowledge.hidden, dimensions);
    if (remainingMines === 0) return { status: 'hint', action: 'dig', certainty: 'certain', rule: 'global-safe', target, evidence: [], details: { remainingMines, hidden: knowledge.hidden.length } };
    if (remainingMines === knowledge.hidden.length) return { status: 'hint', action: 'flag', certainty: 'certain', rule: 'global-mine', target, evidence: [], details: { remainingMines, hidden: knowledge.hidden.length } };
    const mineProbability = remainingMines / knowledge.hidden.length;
    return { status: 'hint', action: 'dig', certainty: 'guess', rule: 'guess', target, evidence: [], details: { totalWays: totalWays.toString(), mineProbability, safeProbability: 1 - mineProbability } };
  }

  const exact = exactProbabilities({ constraints: knowledge.constraints, hidden: knowledge.hidden, remainingMines, maxNodes, maxMs });
  if (exact.incomplete) {
    if (deterministicSafeFallback) return { status: 'hint', ...deterministicSafeFallback };
    return boundedGuess(knowledge.hidden, knowledge.constraints, remainingMines, exact.nodes, dimensions);
  }
  if (exact.inconsistent) return { status: 'inconsistent', rule: 'inconsistent', target: null, evidence: [] };

  const safe = exact.probabilities.filter((entry) => entry.numerator === 0n).sort((left, right) => comparePeripheralKeys(left.key, right.key, dimensions) || Number(right.frontier) - Number(left.frontier) || compareKeys(left.key, right.key))[0];
  const mine = exact.probabilities.filter((entry) => entry.numerator === entry.denominator).sort((left, right) => comparePeripheralKeys(left.key, right.key, dimensions) || Number(right.frontier) - Number(left.frontier) || compareKeys(left.key, right.key))[0];
  if (preferMines && mine) {
    const { evidence, proof } = enumerationEvidence(mine.key, knowledge.constraints, 'safe', exact.totalWays);
    return {
      status: 'hint', action: 'flag', certainty: 'certain', rule: 'enumeration-mine', target: pointFromKey(mine.key),
      evidence,
      details: { totalWays: exact.totalWays.toString(), nodes: exact.nodes, mineProbability: 1, safeProbability: 0, proof },
    };
  }
  if (deterministicSafeFallback) return { status: 'hint', ...deterministicSafeFallback };
  if (safe) {
    const { evidence, proof } = enumerationEvidence(safe.key, knowledge.constraints, 'mine', exact.totalWays);
    return {
      status: 'hint', action: 'dig', certainty: 'certain', rule: 'enumeration-safe', target: pointFromKey(safe.key),
      evidence,
      details: { totalWays: exact.totalWays.toString(), nodes: exact.nodes, mineProbability: 0, safeProbability: 1, proof },
    };
  }
  if (mine) {
    const { evidence, proof } = enumerationEvidence(mine.key, knowledge.constraints, 'safe', exact.totalWays);
    return {
      status: 'hint', action: 'flag', certainty: 'certain', rule: 'enumeration-mine', target: pointFromKey(mine.key),
      evidence,
      details: { totalWays: exact.totalWays.toString(), nodes: exact.nodes, mineProbability: 1, safeProbability: 0, proof },
    };
  }

  const guess = [...exact.probabilities].sort((left, right) => left.probability - right.probability || comparePeripheralKeys(left.key, right.key, dimensions) || Number(right.frontier) - Number(left.frontier) || compareKeys(left.key, right.key))[0];
  return {
    status: 'hint', action: 'dig', certainty: 'guess', rule: 'guess', target: pointFromKey(guess.key),
    evidence: evidenceForTarget(guess.key, knowledge.constraints),
    details: {
      totalWays: exact.totalWays.toString(),
      nodes: exact.nodes,
      mineProbability: guess.probability,
      safeProbability: 1 - guess.probability,
    },
  };
}
