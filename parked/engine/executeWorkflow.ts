import { prisma } from '@/lib/prisma';
import { executors } from '@/lib/blocks/executors';
import type { Graph, GraphNode, GraphEdge } from './graphTypes';

const SKIPPED = Symbol('skipped');

// Топологический порядок этапов по rootGraph; если рёбер нет — порядок как в массиве nodes
function orderStageNodeIds(rootGraph: Graph): string[] {
  const nodeIds = rootGraph.nodes.map((n) => n.id);
  if (rootGraph.edges.length === 0) return nodeIds;

  const indegree = new Map(nodeIds.map((id) => [id, 0]));
  const outgoing = new Map<string, string[]>(nodeIds.map((id) => [id, []]));
  for (const edge of rootGraph.edges) {
    if (!indegree.has(edge.target) || !outgoing.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1);
    outgoing.get(edge.source)!.push(edge.target);
  }

  const queue = nodeIds.filter((id) => indegree.get(id) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) || []) {
      indegree.set(next, (indegree.get(next) || 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  // если остались невключённые ноды (цикл) — добавляем в конец в исходном порядке
  for (const id of nodeIds) if (!order.includes(id)) order.push(id);
  return order;
}

interface StepRecorder {
  (params: {
    stageNodeId: string;
    nodeId: string;
    blockKey: string;
    input: unknown;
    output: unknown;
    status: 'success' | 'error' | 'skipped';
    error?: string;
  }): Promise<void>;
}

async function executeStageGraph(
  stageNodeId: string,
  subGraph: Graph,
  initialPayload: Record<string, unknown>,
  recordStep: StepRecorder
): Promise<Record<string, unknown>> {
  const actionNodes = subGraph.nodes.filter((n) => n.type === 'actionBlock');
  const nodesById = new Map(actionNodes.map((n) => [n.id, n]));
  const incomingByTarget = new Map<string, GraphEdge[]>();
  for (const edge of subGraph.edges) {
    if (!nodesById.has(edge.target) || !nodesById.has(edge.source)) continue;
    if (!incomingByTarget.has(edge.target)) incomingByTarget.set(edge.target, []);
    incomingByTarget.get(edge.target)!.push(edge);
  }

  const outputs = new Map<string, unknown>();
  const visiting = new Set<string>();
  const stageOutputs: Record<string, unknown> = {};

  async function ensureExecuted(nodeId: string): Promise<unknown> {
    if (outputs.has(nodeId)) return outputs.get(nodeId);
    if (visiting.has(nodeId)) {
      throw new Error(`Обнаружен цикл в графе этапа на ноде ${nodeId}`);
    }
    visiting.add(nodeId);

    const node = nodesById.get(nodeId) as GraphNode;
    const blockKey = String(node.data.blockKey);
    const config = (node.data.config as Record<string, unknown>) || {};
    const incoming = incomingByTarget.get(nodeId) || [];

    let input: Record<string, unknown>;
    if (incoming.length === 0) {
      input = blockKey.startsWith('trigger.') ? initialPayload : {};
    } else {
      const parts: Record<string, unknown> = {};
      for (const edge of incoming) {
        const sourceOutput = await ensureExecuted(edge.source);
        if (sourceOutput === SKIPPED) continue;
        const sourceNode = nodesById.get(edge.source);
        if (sourceNode?.data.blockKey === 'logic.condition') {
          const branch = (sourceOutput as Record<string, unknown>).conditionResult ? 'true' : 'false';
          if (edge.sourceHandle && edge.sourceHandle !== branch) continue;
        }
        parts[edge.source] = sourceOutput;
      }
      if (Object.keys(parts).length === 0) {
        visiting.delete(nodeId);
        outputs.set(nodeId, SKIPPED);
        await recordStep({ stageNodeId, nodeId, blockKey, input: {}, output: null, status: 'skipped' });
        return SKIPPED;
      }
      input = parts;
    }

    const executor = executors[blockKey];
    if (!executor) {
      visiting.delete(nodeId);
      const error = `Неизвестный тип блока: ${blockKey}`;
      outputs.set(nodeId, SKIPPED);
      await recordStep({ stageNodeId, nodeId, blockKey, input, output: null, status: 'error', error });
      return SKIPPED;
    }

    try {
      const output = await executor(input, config);
      visiting.delete(nodeId);
      outputs.set(nodeId, output);
      stageOutputs[nodeId] = output;
      await recordStep({ stageNodeId, nodeId, blockKey, input, output, status: 'success' });
      return output;
    } catch (err) {
      visiting.delete(nodeId);
      outputs.set(nodeId, SKIPPED);
      const error = err instanceof Error ? err.message : String(err);
      await recordStep({ stageNodeId, nodeId, blockKey, input, output: null, status: 'error', error });
      throw err;
    }
  }

  for (const node of actionNodes) {
    await ensureExecuted(node.id);
  }

  return stageOutputs;
}

export async function executeWorkflow(workflowId: string, initialPayload: Record<string, unknown>) {
  const workflow = await prisma.workflow.findUniqueOrThrow({
    where: { id: workflowId },
    include: { stages: true },
  });

  const run = await prisma.workflowRun.create({
    data: { workflowId, status: 'running' },
  });

  const recordStep: StepRecorder = async ({ stageNodeId, nodeId, blockKey, input, output, status, error }) => {
    await prisma.workflowRunStep.create({
      data: {
        runId: run.id,
        stageNodeId,
        nodeId,
        blockKey,
        input: input as object,
        output: (output as object) ?? undefined,
        status,
        error,
      },
    });
  };

  const rootGraph = workflow.rootGraph as unknown as Graph;
  const stageOrder = orderStageNodeIds(rootGraph);
  const stagesByNodeId = new Map(workflow.stages.map((s) => [s.nodeId, s]));

  let hadError = false;
  const results: Record<string, Record<string, unknown>> = {};

  for (const stageNodeId of stageOrder) {
    const stage = stagesByNodeId.get(stageNodeId);
    if (!stage) continue;
    try {
      results[stageNodeId] = await executeStageGraph(
        stageNodeId,
        stage.subGraph as unknown as Graph,
        initialPayload,
        recordStep
      );
    } catch {
      hadError = true;
      break;
    }
  }

  await prisma.workflowRun.update({
    where: { id: run.id },
    data: { status: hadError ? 'error' : 'success', finishedAt: new Date() },
  });

  return { runId: run.id, status: hadError ? 'error' : 'success', results };
}
