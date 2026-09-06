import type { Workflow, Stage } from '@prisma/client';
import type { Graph } from '@/lib/engine/graphTypes';

export type MenuItem =
  | { kind: 'card'; nodeId: string; stageNodeId: string; label: string; cardType: string; fields: string[] }
  | { kind: 'report'; nodeId: string; stageNodeId: string; label: string; cardType: string; displayFields: string[] }
  | { kind: 'run'; label: string };

// Собирает пункты меню опубликованного приложения из всех блоков действия во всех этапах.
// Технические блоки (условие, связь, письмо, pdf, напоминание) своих пунктов меню не создают.
export function buildMenu(workflow: Workflow & { stages: Stage[] }): MenuItem[] {
  const items: MenuItem[] = [];
  let hasRunButton = false;

  for (const stage of workflow.stages) {
    const subGraph = stage.subGraph as unknown as Graph;
    for (const node of subGraph.nodes) {
      if (node.type !== 'actionBlock') continue;
      const blockKey = String(node.data.blockKey);
      const config = (node.data.config as Record<string, unknown>) || {};

      if (blockKey === 'data.card') {
        const cardType = String(config.cardType || 'Карточка');
        const fields = String(config.fields || '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        items.push({ kind: 'card', nodeId: node.id, stageNodeId: stage.nodeId, label: cardType, cardType, fields });
      } else if (blockKey === 'ui.report') {
        const cardType = String(config.cardType || '');
        const displayFields = String(config.displayFields || '')
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean);
        items.push({
          kind: 'report',
          nodeId: node.id,
          stageNodeId: stage.nodeId,
          label: String(config.reportName || `Отчёт: ${cardType}`),
          cardType,
          displayFields,
        });
      } else if (blockKey === 'trigger.manual' && !hasRunButton) {
        hasRunButton = true;
        items.push({ kind: 'run', label: String(config.label || `Запустить: ${workflow.name}`) });
      }
    }
  }

  return items;
}
