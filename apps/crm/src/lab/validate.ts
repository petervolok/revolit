import { MANIFESTS } from './manifests';
import type { CubeNode, Project } from './types';

export interface Issue {
  level: 'error' | 'warn';
  where: string;
  message: string;
}

/** Ссылки внутри манифестов на кубики, которых нет в каталоге — дыры самого каталога */
export function validateCatalog(): Issue[] {
  const issues: Issue[] = [];
  const known = new Set(Object.keys(MANIFESTS));
  for (const [key, m] of Object.entries(MANIFESTS)) {
    for (const [slot, def] of Object.entries(m.slots)) {
      for (const a of def.accepts) {
        if (!known.has(a)) issues.push({ level: 'warn', where: `${key} › слот ${slot}`, message: `принимает «${a}», но такого кубика в каталоге нет` });
      }
    }
  }
  return issues;
}

function collect(nodes: CubeNode[]): CubeNode[] {
  return nodes.flatMap((n) => [n, ...collect(Object.values(n.slots ?? {}).flat())]);
}

/** Проверка проекта по правилам сцепления из манифестов */
export function validateProject(project: Project): Issue[] {
  const issues: Issue[] = [];

  const walk = (nodes: CubeNode[], path: string) => {
    nodes.forEach((node, i) => {
      const here = `${path} › ${node.cube}[${i}]`;
      const m = MANIFESTS[node.cube];
      if (!m) return void issues.push({ level: 'error', where: here, message: 'кубика нет в каталоге' });
      if (!m.implemented) issues.push({ level: 'warn', where: here, message: 'кубик описан, но не реализован в тестовой сборке' });
      for (const r of m.required) {
        if (node.props?.[r] === undefined) issues.push({ level: 'error', where: here, message: `не задан обязательный параметр «${r}»` });
      }
      for (const [slotKey, children] of Object.entries(node.slots ?? {})) {
        const def = m.slots[slotKey];
        if (!def) {
          issues.push({ level: 'error', where: here, message: `у кубика нет слота «${slotKey}»` });
          continue;
        }
        if (def.cardinality === 'one' && children.length > 1) issues.push({ level: 'error', where: `${here} › ${slotKey}`, message: 'в слот помещается один кубик, а положено несколько' });
        for (const child of children) {
          if (!def.accepts.includes(child.cube)) issues.push({ level: 'error', where: `${here} › ${slotKey}`, message: `слот не принимает «${child.cube}» (ждёт: ${def.accepts.join(', ')})` });
        }
        walk(children, `${here} › ${slotKey}`);
      }
    });
  };

  for (const screen of project.screens) {
    walk(screen.layout, screen.name);

    // Действие ссылается на кубик, которого на экране нет — клик ничего не покажет
    const all = collect(screen.layout);
    const actions = new Set(all.flatMap((n) => Object.values(n.props ?? {}).filter((v): v is string => typeof v === 'string')));
    if (actions.has('open-detail-panel') && !all.some((n) => n.cube === 'detail-panel')) {
      issues.push({ level: 'error', where: screen.name, message: 'есть действие «open-detail-panel», но панели деталей на экране нет' });
    }
    if (actions.has('open-modal-editor') && !all.some((n) => n.cube === 'modal-editor')) {
      issues.push({ level: 'error', where: screen.name, message: 'есть действие «open-modal-editor», но модального редактора на экране нет' });
    }
  }
  return issues;
}
