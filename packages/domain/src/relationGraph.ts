import type { CaseStatus, PersonNode, RelationEdge } from './models';

export type RelationGraphPoint = {
  x: number;
  y: number;
};

export type RelationGraphNode = PersonNode & {
  x: number;
  y: number;
  lane: RelationGraphLane;
  degree: number;
  rank: number;
  locked?: boolean;
};

export type RelationGraphEdge = RelationEdge & {
  from: RelationGraphPoint;
  to: RelationGraphPoint;
  control: RelationGraphPoint;
  mid: RelationGraphPoint;
  angle: number;
  length: number;
  parallelIndex: number;
  parallelCount: number;
  startLabel: string;
  endLabel: string;
};

export type FocusedGraphElement =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string };

export type RelationGraphLayout = {
  nodes: RelationGraphNode[];
  edges: RelationGraphEdge[];
  lanes: RelationGraphLaneSummary[];
  density: {
    nodeCount: number;
    edgeCount: number;
    maxDegree: number;
  };
};

export type RelationGraphLane = 'center' | 'right' | 'left' | 'upper' | 'lower';

export type RelationGraphLaneSummary = {
  id: RelationGraphLane;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RelationGraphPosition = {
  id: string;
  x: number;
  y: number;
  locked?: boolean;
};

const DEFAULT_NODE_RADIUS = 8.5;
const MIN_NODE_DISTANCE = DEFAULT_NODE_RADIUS * 2.45;
const FALLBACK_POSITIONS: RelationGraphPoint[] = [
  { x: 50, y: 50 },
  { x: 78, y: 38 },
  { x: 76, y: 70 },
  { x: 50, y: 80 },
  { x: 22, y: 34 },
  { x: 24, y: 68 },
  { x: 50, y: 22 },
  { x: 86, y: 54 },
  { x: 14, y: 54 },
];

export class CaseHandoffCode {
  constructor(
    readonly id: string,
    readonly caseId: string,
    readonly institutionId: string,
    readonly createdBy: string,
    readonly expiresAt: string,
    readonly redeemedAt: string | null = null,
    readonly revokedAt: string | null = null,
  ) {}

  get active(): boolean {
    return !this.redeemedAt && !this.revokedAt && new Date(this.expiresAt).getTime() > Date.now();
  }

  static canCreateForStatus(status: CaseStatus): boolean {
    return ['submitted', 'assigned', 'in_review', 'completed'].includes(status);
  }
}

export function buildRelationGraphLayout(
  people: PersonNode[],
  relations: RelationEdge[],
  savedPositions: RelationGraphPosition[] = [],
  nodeRadius = DEFAULT_NODE_RADIUS,
): RelationGraphLayout {
  const positionById = new Map(savedPositions.map((position) => [position.id, position]));
  const degreeById = relationDegrees(people, relations);
  const automaticPositions = automaticPositionsFor(people, relations, degreeById);
  const nodes = people.map((person, index) => {
    const saved = positionById.get(person.id);
    const fallback = automaticPositions.get(person.id) ?? automaticPosition(person, index);
    return {
      ...person,
      x: clampCoordinate(saved?.x ?? fallback.x),
      y: clampCoordinate(saved?.y ?? fallback.y),
      lane: laneForPerson(person, index),
      degree: degreeById.get(person.id) ?? 0,
      rank: index + 1,
      locked: saved?.locked ?? false,
    };
  });
  const relaxedNodes = relaxNodeCollisions(nodes, nodeRadius);
  const nodeById = new Map(relaxedNodes.map((node) => [node.id, node]));
  const parallelGroups = parallelRelationGroups(relations);
  const edges = relations.flatMap((relation) => {
    const fromNode = nodeById.get(relation.fromPersonId);
    const toNode = nodeById.get(relation.toPersonId);
    if (!fromNode || !toNode) return [];
    const groupKey = relationPairKey(relation);
    const group = parallelGroups.get(groupKey) ?? [relation.id];
    const parallelIndex = Math.max(0, group.indexOf(relation.id));
    const geometry = curvedEdgeGeometry(fromNode, toNode, nodeRadius, parallelIndex, group.length);
    return [{
      ...relation,
      ...geometry,
      parallelIndex,
      parallelCount: group.length,
      startLabel: fromNode.label.split('\n')[0] ?? fromNode.label,
      endLabel: toNode.label.split('\n')[0] ?? toNode.label,
    }];
  });
  return {
    nodes: relaxedNodes,
    edges,
    lanes: relationGraphLanes(),
    density: {
      nodeCount: relaxedNodes.length,
      edgeCount: edges.length,
      maxDegree: Math.max(0, ...relaxedNodes.map((node) => node.degree)),
    },
  };
}

export function focusRelationGraph(
  layout: RelationGraphLayout,
  target: FocusedGraphElement | null,
): RelationGraphLayout {
  if (!target) return layout;
  if (target.kind === 'edge') {
    const selectedEdge = layout.edges.find((edge) => edge.id === target.id);
    if (!selectedEdge) return layout;
    const nodeIds = new Set([selectedEdge.fromPersonId, selectedEdge.toPersonId]);
    return {
      nodes: layout.nodes.filter((node) => nodeIds.has(node.id)),
      edges: [selectedEdge],
      lanes: layout.lanes,
      density: {
        nodeCount: nodeIds.size,
        edgeCount: 1,
        maxDegree: Math.max(0, ...layout.nodes.filter((node) => nodeIds.has(node.id)).map((node) => node.degree)),
      },
    };
  }

  const relatedEdges = layout.edges.filter((edge) => edge.fromPersonId === target.id || edge.toPersonId === target.id);
  const nodeIds = new Set([target.id]);
  relatedEdges.forEach((edge) => {
    nodeIds.add(edge.fromPersonId);
    nodeIds.add(edge.toPersonId);
  });
  return {
    nodes: layout.nodes.filter((node) => nodeIds.has(node.id)),
    edges: relatedEdges,
    lanes: layout.lanes,
    density: {
      nodeCount: nodeIds.size,
      edgeCount: relatedEdges.length,
      maxDegree: Math.max(0, ...layout.nodes.filter((node) => nodeIds.has(node.id)).map((node) => node.degree)),
    },
  };
}

export function edgeEndpoints(fromNode: RelationGraphPoint, toNode: RelationGraphPoint, nodeRadius = DEFAULT_NODE_RADIUS) {
  const dx = toNode.x - fromNode.x;
  const dy = toNode.y - fromNode.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return {
      from: { ...fromNode },
      to: { ...toNode },
    };
  }
  const unitX = dx / length;
  const unitY = dy / length;
  return {
    from: {
      x: fromNode.x + unitX * nodeRadius,
      y: fromNode.y + unitY * nodeRadius,
    },
    to: {
      x: toNode.x - unitX * nodeRadius,
      y: toNode.y - unitY * nodeRadius,
    },
  };
}

function curvedEdgeGeometry(
  fromNode: RelationGraphPoint,
  toNode: RelationGraphPoint,
  nodeRadius: number,
  parallelIndex: number,
  parallelCount: number,
) {
  const endpoints = edgeEndpoints(fromNode, toNode, nodeRadius);
  const straightMid = {
    x: (endpoints.from.x + endpoints.to.x) / 2,
    y: (endpoints.from.y + endpoints.to.y) / 2,
  };
  const dx = endpoints.to.x - endpoints.from.x;
  const dy = endpoints.to.y - endpoints.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return {
      ...endpoints,
      control: { ...straightMid },
      mid: { ...straightMid },
      angle: 0,
      length: 0,
    };
  }

  const offsetIndex = parallelIndex - (parallelCount - 1) / 2;
  const offset = parallelCount <= 1 ? 0 : offsetIndex * 5.6;
  const normalX = -dy / length;
  const normalY = dx / length;
  const control = {
    x: clampCoordinate(straightMid.x + normalX * offset),
    y: clampCoordinate(straightMid.y + normalY * offset),
  };
  const mid = quadraticPoint(endpoints.from, control, endpoints.to, 0.5);

  return {
    ...endpoints,
    control,
    mid,
    angle: Math.atan2(endpoints.to.y - endpoints.from.y, endpoints.to.x - endpoints.from.x) * (180 / Math.PI),
    length: distance(endpoints.from, endpoints.to),
  };
}

function quadraticPoint(from: RelationGraphPoint, control: RelationGraphPoint, to: RelationGraphPoint, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * from.x + 2 * inverse * t * control.x + t * t * to.x,
    y: inverse * inverse * from.y + 2 * inverse * t * control.y + t * t * to.y,
  };
}

function relationDegrees(people: PersonNode[], relations: RelationEdge[]) {
  const ids = new Set(people.map((person) => person.id));
  const degreeById = new Map(people.map((person) => [person.id, 0]));
  for (const relation of relations) {
    if (ids.has(relation.fromPersonId)) degreeById.set(relation.fromPersonId, (degreeById.get(relation.fromPersonId) ?? 0) + 1);
    if (ids.has(relation.toPersonId)) degreeById.set(relation.toPersonId, (degreeById.get(relation.toPersonId) ?? 0) + 1);
  }
  return degreeById;
}

function automaticPositionsFor(
  people: PersonNode[],
  relations: RelationEdge[],
  degreeById: Map<string, number>,
) {
  const positions = new Map<string, RelationGraphPoint>();
  const primary = people.find((person) => person.tone === 'primary') ?? people[0];
  if (primary) positions.set(primary.id, { x: 50, y: 52 });

  const lanePeople = {
    right: people.filter((person) => person.id !== primary?.id && person.tone === 'danger'),
    left: people.filter((person) => person.id !== primary?.id && person.tone === 'support'),
    neutral: people.filter((person) => person.id !== primary?.id && person.tone === 'neutral'),
    other: people.filter((person) => person.id !== primary?.id && !['danger', 'support', 'neutral'].includes(person.tone)),
  };

  placeVerticalLane(positions, lanePeople.right, 78, 26, 72, degreeById);
  placeVerticalLane(positions, lanePeople.left, 22, 32, 78, degreeById);
  placeNeutralLanes(positions, lanePeople.neutral, relations, degreeById);
  placeRadialOverflow(positions, lanePeople.other, degreeById);

  return positions;
}

function placeVerticalLane(
  positions: Map<string, RelationGraphPoint>,
  people: PersonNode[],
  x: number,
  startY: number,
  endY: number,
  degreeById: Map<string, number>,
) {
  const sorted = sortByGraphWeight(people, degreeById);
  const span = Math.max(0, endY - startY);
  sorted.forEach((person, index) => {
    const y = sorted.length === 1 ? (startY + endY) / 2 : startY + (span * index) / (sorted.length - 1);
    positions.set(person.id, { x, y });
  });
}

function placeNeutralLanes(
  positions: Map<string, RelationGraphPoint>,
  people: PersonNode[],
  relations: RelationEdge[],
  degreeById: Map<string, number>,
) {
  const sorted = sortByGraphWeight(people, degreeById);
  const upper: PersonNode[] = [];
  const lower: PersonNode[] = [];
  sorted.forEach((person) => {
    const incomingFromDanger = relations.some((relation) => (
      relation.toPersonId === person.id && relation.fromPersonId.includes('actor')
    ));
    if (incomingFromDanger || upper.length <= lower.length) upper.push(person);
    else lower.push(person);
  });
  placeHorizontalLane(positions, upper, 34, 70, 22, degreeById);
  placeHorizontalLane(positions, lower, 36, 66, 84, degreeById);
}

function placeHorizontalLane(
  positions: Map<string, RelationGraphPoint>,
  people: PersonNode[],
  startX: number,
  endX: number,
  y: number,
  degreeById: Map<string, number>,
) {
  const sorted = sortByGraphWeight(people, degreeById);
  const span = Math.max(0, endX - startX);
  sorted.forEach((person, index) => {
    const x = sorted.length === 1 ? (startX + endX) / 2 : startX + (span * index) / (sorted.length - 1);
    positions.set(person.id, { x, y });
  });
}

function placeRadialOverflow(
  positions: Map<string, RelationGraphPoint>,
  people: PersonNode[],
  degreeById: Map<string, number>,
) {
  sortByGraphWeight(people, degreeById).forEach((person, index) => {
    const fallback = FALLBACK_POSITIONS[(index + 6) % FALLBACK_POSITIONS.length] ?? { x: 50, y: 50 };
    positions.set(person.id, fallback);
  });
}

function relaxNodeCollisions(nodes: RelationGraphNode[], nodeRadius: number): RelationGraphNode[] {
  const minDistance = Math.max(MIN_NODE_DISTANCE, nodeRadius * 2.35);
  let relaxed = nodes.map((node) => ({ ...node }));
  for (let iteration = 0; iteration < 24; iteration += 1) {
    let moved = false;
    for (let leftIndex = 0; leftIndex < relaxed.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < relaxed.length; rightIndex += 1) {
        const left = relaxed[leftIndex]!;
        const right = relaxed[rightIndex]!;
        const dx = right.x - left.x;
        const dy = right.y - left.y;
        const currentDistance = Math.hypot(dx, dy) || 0.01;
        if (currentDistance >= minDistance) continue;
        const push = (minDistance - currentDistance) / 2;
        const unitX = dx / currentDistance;
        const unitY = dy / currentDistance;
        const leftLocked = Boolean(left.locked);
        const rightLocked = Boolean(right.locked);
        if (!leftLocked) {
          left.x = clampCoordinate(left.x - unitX * push);
          left.y = clampCoordinate(left.y - unitY * push);
          moved = true;
        }
        if (!rightLocked) {
          right.x = clampCoordinate(right.x + unitX * push);
          right.y = clampCoordinate(right.y + unitY * push);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return relaxed;
}

function parallelRelationGroups(relations: RelationEdge[]) {
  const groups = new Map<string, string[]>();
  for (const relation of relations) {
    const key = relationPairKey(relation);
    groups.set(key, [...(groups.get(key) ?? []), relation.id]);
  }
  return groups;
}

function relationPairKey(relation: RelationEdge) {
  return [relation.fromPersonId, relation.toPersonId].sort().join('::');
}

function sortByGraphWeight(people: PersonNode[], degreeById: Map<string, number>) {
  return [...people].sort((left, right) => {
    const degreeDiff = (degreeById.get(right.id) ?? 0) - (degreeById.get(left.id) ?? 0);
    if (degreeDiff !== 0) return degreeDiff;
    return left.label.localeCompare(right.label);
  });
}

function relationGraphLanes(): RelationGraphLaneSummary[] {
  return [
    { id: 'left', label: '지원·보호 축', x: 8, y: 18, width: 28, height: 72 },
    { id: 'center', label: '피해 학생 중심', x: 38, y: 34, width: 24, height: 36 },
    { id: 'right', label: '행위·확산 축', x: 64, y: 18, width: 28, height: 72 },
    { id: 'upper', label: '목격·상황 단서', x: 30, y: 8, width: 40, height: 22 },
    { id: 'lower', label: '전달·후속 조치', x: 30, y: 74, width: 40, height: 18 },
  ];
}

function laneForPerson(person: PersonNode, index: number): RelationGraphLane {
  if (person.tone === 'primary') return 'center';
  if (person.tone === 'danger') return 'right';
  if (person.tone === 'support') return 'left';
  if (person.tone === 'neutral') return index % 2 === 0 ? 'upper' : 'lower';
  return 'lower';
}

function automaticPosition(person: PersonNode, index: number): RelationGraphPoint {
  if (person.tone === 'primary') return { x: 50, y: 50 };
  if (person.tone === 'danger') return dangerPosition(index);
  if (person.tone === 'support') return supportPosition(index);
  return FALLBACK_POSITIONS[index % FALLBACK_POSITIONS.length] ?? { x: 50, y: 50 };
}

function dangerPosition(index: number): RelationGraphPoint {
  const positions = [
    { x: 78, y: 38 },
    { x: 82, y: 60 },
    { x: 68, y: 24 },
  ];
  return positions[index % positions.length] ?? positions[0]!;
}

function supportPosition(index: number): RelationGraphPoint {
  const positions = [
    { x: 22, y: 34 },
    { x: 24, y: 68 },
    { x: 50, y: 82 },
  ];
  return positions[index % positions.length] ?? positions[0]!;
}

function clampCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.max(8, Math.min(92, value));
}

function distance(from: RelationGraphPoint, to: RelationGraphPoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y);
}
