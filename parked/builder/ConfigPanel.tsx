'use client';

export interface ConfigField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
}

interface StageSelection {
  kind: 'stage';
  nodeId: string;
  name: string;
}
interface WorkstationSelection {
  kind: 'workstation';
  nodeId: string;
  name: string;
  regulation: string;
  skill: string;
  executorType: string;
}
interface ActionBlockSelection {
  kind: 'actionBlock';
  nodeId: string;
  name: string;
  configSchema: ConfigField[];
  config: Record<string, unknown>;
}

export type Selection = StageSelection | WorkstationSelection | ActionBlockSelection;

interface Props {
  selection: Selection | null;
  onChange: (nodeId: string, patch: Record<string, unknown>) => void;
  onClose: () => void;
}

const fieldStyle: React.CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 13, marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4 };
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#374151', display: 'block', marginTop: 12 };

export default function ConfigPanel({ selection, onChange, onClose }: Props) {
  if (!selection) return null;

  return (
    <aside
      style={{
        width: 300,
        borderLeft: '1px solid #e5e7eb',
        padding: 16,
        background: 'white',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ fontSize: 14, margin: 0 }}>Настройки</h3>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>

      {selection.kind === 'stage' && (
        <div>
          <label style={labelStyle}>
            Название этапа
            <input style={fieldStyle} value={selection.name} onChange={(e) => onChange(selection.nodeId, { name: e.target.value })} />
          </label>
        </div>
      )}

      {selection.kind === 'workstation' && (
        <div>
          <label style={labelStyle}>
            Название рабочего места
            <input style={fieldStyle} value={selection.name} onChange={(e) => onChange(selection.nodeId, { name: e.target.value })} />
          </label>
          <label style={labelStyle}>
            Исполнитель
            <select
              style={fieldStyle}
              value={selection.executorType}
              onChange={(e) => onChange(selection.nodeId, { executorType: e.target.value })}
            >
              <option value="human">Человек</option>
              <option value="ai">ИИ-агент</option>
              <option value="both">Человек или ИИ</option>
            </select>
          </label>
          <label style={labelStyle}>
            Регламент
            <textarea style={{ ...fieldStyle, minHeight: 80 }} value={selection.regulation} onChange={(e) => onChange(selection.nodeId, { regulation: e.target.value })} />
          </label>
          <label style={labelStyle}>
            Скил
            <textarea style={{ ...fieldStyle, minHeight: 60 }} value={selection.skill} onChange={(e) => onChange(selection.nodeId, { skill: e.target.value })} />
          </label>
        </div>
      )}

      {selection.kind === 'actionBlock' && (
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, marginTop: 12 }}>{selection.name}</p>
          {selection.configSchema.map((field) => (
            <label key={field.name} style={labelStyle}>
              {field.label}
              {field.type === 'select' ? (
                <select
                  style={fieldStyle}
                  value={String(selection.config[field.name] ?? '')}
                  onChange={(e) => onChange(selection.nodeId, { config: { ...selection.config, [field.name]: e.target.value } })}
                >
                  <option value="" disabled>
                    Выберите…
                  </option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  style={fieldStyle}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={String(selection.config[field.name] ?? '')}
                  onChange={(e) => onChange(selection.nodeId, { config: { ...selection.config, [field.name]: e.target.value } })}
                />
              )}
            </label>
          ))}
        </div>
      )}
    </aside>
  );
}
