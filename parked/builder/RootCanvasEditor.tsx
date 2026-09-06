'use client';

import { useCallback, useRef, useState } from 'react';
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

import StageCanvas from './StageCanvas';
import { CATEGORY_COLOR } from './nodeVisuals';

let idCounter = 0;
const nextId = () => `stage_${Date.now()}_${idCounter++}`;

interface Props {
  workflowId: string;
  slug: string;
  initialName: string;
  initialGraph: { nodes: Node[]; edges: Edge[] };
}

export default function RootCanvasEditor({ workflowId, slug, initialName, initialGraph }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [instance, setInstance] = useState<ReactFlowInstance | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialGraph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialGraph.edges);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [openStageNodeId, setOpenStageNodeId] = useState<string | null>(null);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const isStage = e.dataTransfer.getData('application/revolit-stage');
      if (!isStage || !instance || !wrapperRef.current) return;
      const bounds = wrapperRef.current.getBoundingClientRect();
      const position = instance.screenToFlowPosition({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
      const id = nextId();
      const newNode: Node = {
        id,
        type: 'stage',
        position,
        data: { name: 'Новый этап', label: 'Новый этап' },
        style: {
          border: `2px solid ${CATEGORY_COLOR.stage}`,
          borderRadius: 10,
          padding: 14,
          fontSize: 13,
          background: 'white',
          minWidth: 140,
          textAlign: 'center',
        },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [instance, setNodes]
  );

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setOpenStageNodeId(node.id);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch(`/api/workflows/${workflowId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rootGraph: { nodes, edges } }),
    });
    setSaving(false);
  };

  const openStage = nodes.find((n) => n.id === openStageNodeId);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ fontSize: 15, fontWeight: 600, padding: '4px 6px' }} />
        <span style={{ fontSize: 12, color: '#6b7280' }}>/{slug}</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave} disabled={saving} style={{ padding: '6px 14px' }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
        <a href={`/app/${slug}`} target="_blank" rel="noreferrer" style={{ padding: '6px 14px', border: '1px solid #2563eb', borderRadius: 4, color: '#2563eb', textDecoration: 'none' }}>
          Открыть приложение ↗
        </a>
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <aside style={{ width: 220, borderRight: '1px solid #e5e7eb', padding: 12, background: '#fafafa' }}>
          <h4 style={{ fontSize: 13, margin: '4px 0' }}>Этапы процесса</h4>
          <div
            draggable
            onDragStart={(e) => e.dataTransfer.setData('application/revolit-stage', '1')}
            style={{ border: `2px solid ${CATEGORY_COLOR.stage}`, borderRadius: 8, padding: '8px 10px', cursor: 'grab', fontSize: 13, background: 'white' }}
          >
            + Этап
          </div>
          <p style={{ fontSize: 11, color: '#6b7280', marginTop: 12 }}>Перетащите на холст, соедините по порядку выполнения, кликните — чтобы наполнить рабочими местами и блоками.</p>
        </aside>

        <div ref={wrapperRef} style={{ flex: 1 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onInit={setInstance}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      {openStage && (
        <StageCanvas
          workflowId={workflowId}
          stageNodeId={openStage.id}
          initialName={String(openStage.data.name)}
          onClose={() => setOpenStageNodeId(null)}
        />
      )}
    </div>
  );
}
