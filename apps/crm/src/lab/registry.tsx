'use client';

import type { ComponentType } from 'react';
import type { CubeNode } from './types';

const registry: Record<string, ComponentType<{ node: CubeNode }>> = {};

export function registerCube(key: string, component: ComponentType<{ node: CubeNode }>) {
  registry[key] = component;
}

/** Интерпретатор: узел дерева → живой кубик. Неизвестный или нереализованный кубик — видимая заглушка. */
export function RenderNode({ node }: { node: CubeNode }) {
  const Cube = registry[node.cube];
  if (!Cube) {
    return (
      <div className="rounded-lg border border-dashed border-line p-3 text-xs text-ink-faint">
        Кубик «{node.cube}» не реализован в тестовой сборке
      </div>
    );
  }
  return <Cube node={node} />;
}

export function Slot({ nodes }: { nodes?: CubeNode[] }) {
  if (!nodes?.length) return null;
  return (
    <>
      {nodes.map((n, i) => (
        <RenderNode key={i} node={n} />
      ))}
    </>
  );
}
