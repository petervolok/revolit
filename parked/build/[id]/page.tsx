'use client';

import { useEffect, useState } from 'react';
import RootCanvasEditor from '@/components/builder/RootCanvasEditor';

interface WorkflowData {
  id: string;
  name: string;
  slug: string;
  rootGraph: { nodes: unknown[]; edges: unknown[] };
}

export default function BuildEditorPage({ params }: { params: { id: string } }) {
  const [workflow, setWorkflow] = useState<WorkflowData | null>(null);

  useEffect(() => {
    fetch(`/api/workflows/${params.id}`)
      .then((r) => r.json())
      .then(setWorkflow);
  }, [params.id]);

  if (!workflow) return <p style={{ padding: 20 }}>Загрузка…</p>;

  return (
    <RootCanvasEditor
      workflowId={workflow.id}
      slug={workflow.slug}
      initialName={workflow.name}
      initialGraph={workflow.rootGraph as { nodes: never[]; edges: never[] }}
    />
  );
}
