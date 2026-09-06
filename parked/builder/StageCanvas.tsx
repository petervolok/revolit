'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';

import ConfigPanel, { type Selection } from './ConfigPanel';
import { CATEGORY_COLOR } from './nodeVisuals';
import ActionBlockNode from './nodes/ActionBlockNode';

const nodeTypes = { actionBlock: ActionBlockNode };

interface WorkstationTemplate {
  id: string;
  key: string;
  name: string;
  defaultRegulation: string;
  defaultSkill: string;
  executorType: string;
}

interface ActionBlockDef {
  id: string;
  key: string;
  name: string;
  category: string;
  description?: string;
  configSchema: { name: string; label: string; type: 'text' | 'number' | 'select'; options?: string[] }[];
}

let idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now()}_${idCounter++}`;

const WORKSTATION_SIZE = { width: 340, height: 220 };

export default function StageCanvas({
  workflowId,
  stageNodeId,
  initialName,
  onClose,
}: {
  workflowId: string;
  stageNodeId: string;
  initialName: string;
  onClose: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);
  const [stageName, setStageName] = useState(initialName);
  const [workstationLib, setWorkstationLib] = useState<WorkstationTemplate[]>([]);
  const [actionLib, setActionLib] = useState<ActionBlockDef[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch('/api/library/workstations').then((r) => r.json()).then(setWorkstationLib);
    fetch('/api/library/action-blocks').then((r) => r.json()).then(setActionLib);
    fetch(`/api/workflows/${workflowId}/stages/${stageNodeId}`)
      .then((r) => r.json())
      .then((stage) => {
        const graph = stage.subGraph || { nodes: [], edges: [] };
        setNodes(graph.nodes || []);
        setEdges(graph.edges || []);
        if (stage.name) setStageName(stage.name);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId, stageNodeId]);

  const selection: Selection | null = useMemo(() => {
    if (!selectedId) return null;
    const node = nodes.find((n) => n.id === selectedId);
    if (!node) return null;
    if (node.type === 'workstation') {
      return {
        kind: 'workstation',
        nodeId: node.id,
        name: node.data.name,
        regulation: node.data.regulation,
        skill: node.data.skill,
        executorType: node.data.executorType,
      };
    }
    if (node.type === 'actionBlock') {
      return {
        kind: 'actionBlock',
        nodeId: node.id,
        name: node.data.name,
        configSchema: node.data.configSchema,
        config: node.data.config || {},
      };
    }
    return null;
  }, [selectedId, nodes]);

  const renderLabel = (data: Record<string, unknown>, type?: string) => {
    if (type === 'workstation') {
      const icon = data.executorType === 'ai' ? '🤖' : data.executorType === 'both' ? '🤝' : '👤';
      return `${icon} ${data.name}`;
    }
    return String(data.name);
  };

  const applyLabels = (list: Node[]) =>
    list.map((n) => ({ ...n, data: { ...n.data, label: renderLabel(n.data, n.type) } }));

  useEffect(() => {
    if (loaded) setNodes((nds) => applyLabels(nds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const findParentWorkstation = (flowPos: { x: number; y: number }) => {
    return nodes.find((n) => {
      if (n.type !== 'workstation') return false;
      const w = (n.style?.width as number) || WORKSTATION_SIZE.width;
      const h = (n.style?.height as number) || WORKSTATION_SIZE.height;
      return (
        flowPos.x >= n.position.x &&
        flowPos.x <= n.position.x + w &&
        flowPos.y >= n.position.y &&
        flowPos.y <= n.position.y + h
      );
    });
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!instance || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const flowPos = instance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });

      const workstationKey = e.dataTransfer.getData('application/revolit-workstation');
      const actionKey = e.dataTransfer.getData('application/revolit-action-block');

      if (workstationKey) {
        const tpl = workstationLib.find((w) => w.key === workstationKey);
        if (!tpl) return;
        const id = nextId('ws');
        const newNode: Node = {
          id,
          type: 'workstation',
          position: flowPos,
          data: {
            name: tpl.name,
            regulation: tpl.defaultRegulation,
            skill: tpl.defaultSkill,
            executorType: tpl.executorType,
            label: renderLabel({ name: tpl.name, executorType: tpl.executorType }, 'workstation'),
          },
          style: {
            width: WORKSTATION_SIZE.width,
            height: WORKSTATION_SIZE.height,
            background: 'rgba(15,118,110,0.05)',
            border: `2px dashed ${CATEGORY_COLOR.workstation}`,
            borderRadius: 10,
          },
        };
        setNodes((nds) => nds.concat(newNode));
        return;
      }

      if (actionKey) {
        const def = actionLib.find((b) => b.key === actionKey);
        if (!def) return;
        const parent = findParentWorkstation(flowPos);
        const id = nextId('block');
        const newNode: Node = {
          id,
          type: 'actionBlock',
          position: parent ? { x: flowPos.x - parent.position.x, y: flowPos.y - parent.position.y } : flowPos,
          parentNode: parent?.id,
          extent: parent ? 'parent' : undefined,
          data: { blockKey: def.key, name: def.name, category: def.category, configSchema: def.configSchema, config: {}, label: def.name },
          style: {
            border: `2px solid ${CATEGORY_COLOR[def.category] || '#666'}`,
            borderRadius: 8,
            padding: 8,
            fontSize: 12,
            background: 'white',
            width: 170,
          },
        };
        setNodes((nds) => nds.concat(newNode));
      }
    },
    [instance, workstationLib, actionLib, nodes, setNodes]
  );

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type === 'workstation' || node.type === 'actionBlock') setSelectedId(node.id);
  }, []);

  const handleConfigChange = (nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        const nextData = { ...n.data, ...patch };
        nextData.label = renderLabel(nextData, n.type);
        return { ...n, data: nextData };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/workflows/${workflowId}/stages/${stageNodeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: stageName, subGraph: { nodes, edges } }),
    });
    setSaving(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'white', zIndex: 50, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <button onClick={onClose} style={{ padding: '6px 10px' }}>← Назад</button>
        <input
          value={stageName}
          onChange={(e) => setStageName(e.target.value)}
          style={{ fontSize: 15, fontWeight: 600, border: '1px solid transparent', padding: '4px 6px' }}
        />
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={saving} style={{ padding: '6px 14px' }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 260, borderRight: '1px solid #e5e7eb', padding: 12, overflowY: 'auto', background: '#fafafa' }}>
          <h4 style={{ fontSize: 13, margin: '4px 0' }}>Рабочие места</h4>
          {workstationLib.map((w) => (
            <div
              key={w.key}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/revolit-workstation', w.key)}
              style={{ border: `1px dashed ${CATEGORY_COLOR.workstation}`, borderRadius: 6, padding: '6px 8px', marginBottom: 6, cursor: 'grab', fontSize: 13, background: 'white' }}
            >
              {w.name}
            </div>
          ))}
          <h4 style={{ fontSize: 13, margin: '16px 0 4px' }}>Блоки действия</h4>
          {actionLib.map((b) => (
            <div
              key={b.key}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('application/revolit-action-block', b.key)}
              title={b.description}
              style={{ border: `1px solid ${CATEGORY_COLOR[b.category] || '#666'}`, borderLeft: `4px solid ${CATEGORY_COLOR[b.category] || '#666'}`, borderRadius: 6, padding: '6px 8px', marginBottom: 6, cursor: 'grab', fontSize: 13, background: 'white' }}
            >
              {b.name}
            </div>
          ))}
        </aside>

        <div ref={wrapperRef} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={() => setSelectedId(null)}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>

        <ConfigPanel selection={selection} onChange={handleConfigChange} onClose={() => setSelectedId(null)} />
      </div>
    </div>
  );
}
