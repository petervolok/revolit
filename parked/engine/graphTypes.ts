export interface GraphNode {
  id: string;
  type: string; // 'stage' | 'workstation' | 'actionBlock'
  data: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null; // 'true' | 'false' для logic.condition
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
