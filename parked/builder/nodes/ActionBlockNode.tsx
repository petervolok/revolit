'use client';

import { Handle, Position, type NodeProps } from 'reactflow';

export default function ActionBlockNode({ data }: NodeProps) {
  const isCondition = data.blockKey === 'logic.condition';

  return (
    <div style={{ fontSize: 12, textAlign: 'center', position: 'relative' }}>
      <Handle type="target" position={Position.Left} />
      {data.label}
      {isCondition ? (
        <>
          <Handle type="source" id="true" position={Position.Right} style={{ top: '35%', background: '#16a34a' }} />
          <Handle type="source" id="false" position={Position.Right} style={{ top: '65%', background: '#dc2626' }} />
          <div style={{ fontSize: 9, color: '#16a34a', position: 'absolute', right: -28, top: '28%' }}>да</div>
          <div style={{ fontSize: 9, color: '#dc2626', position: 'absolute', right: -28, top: '60%' }}>нет</div>
        </>
      ) : (
        <Handle type="source" position={Position.Right} />
      )}
    </div>
  );
}
