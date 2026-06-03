import type { CaseStatus, PersonNode, RelationEdge } from './models';

export type RelationGraphPoint = {
  x: number;
  y: number;
};

export type RelationGraphNode = PersonNode & {
  x: number;
  y: number;
  locked?: boolean;
};

export type RelationGraphEdge = RelationEdge & {
  from: RelationGraphPoint;
  to: RelationGraphPoint;
  mid: RelationGraphPoint;
  angle: number;
  length: number;
};

export type FocusedGraphElement =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string };

export type RelationGraphLayout = {
  nodes: RelationGraphNode[];
  edges: RelationGraphEdge[];
};

export type RelationGraphPosition = {
  id: string;
  x: number;
  y: number;
  locked?: boolean;
};

const DEFAULT_NODE_RADIUS = 8.5;
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
  const nodes = people.map((person, index) => {
    const saved = positionById.get(person.id);
    const fallback = automaticPosition(person, index);
    return {
      ...person,
      x: clampCoordinate(saved?.x ?? fallback.x),
      y: clampCoordinate(saved?.y ?? fallback.y),
      locked: saved?.locked ?? false,
    };
  });
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = relations.flatMap((relation) => {
    const fromNode = nodeById.get(relation.fromPersonId);
    const toNode = nodeById.get(relation.toPersonId);
    if (!fromNode || !toNode) return [];
    const endpoints = edgeEndpoints(fromNode, toNode, nodeRadius);
    return [{
      ...relation,
      ...endpoints,
      mid: {
        x: (endpoints.from.x + endpoints.to.x) / 2,
        y: (endpoints.from.y + endpoints.to.y) / 2,
      },
      angle: Math.atan2(endpoints.to.y - endpoints.from.y, endpoints.to.x - endpoints.from.x) * (180 / Math.PI),
      length: distance(endpoints.from, endpoints.to),
    }];
  });
  return { nodes, edges };
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
