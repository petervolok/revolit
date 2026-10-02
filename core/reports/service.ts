/**
 * Базовые отчёты по записям сущностей (Р-34). Честная оговорка: это простой
 * счётчик по значению одного поля, а не полноценная аналитика — сводных
 * таблиц, срезов по нескольким полям и произвольных диаграмм здесь нет.
 */
import { listRecords, listTemplatesFor } from '../entities/service';
import type { ViewerUser } from '../entities/access';
import type { FieldReport, ReportableTemplate } from './types';

export class ReportError extends Error {}

/** Сущности и их поля, по которым можно построить распределение */
export async function listReportableTemplates(programId: string, viewer?: ViewerUser): Promise<ReportableTemplate[]> {
  // Только сущности, доступные сотруднику, и без скрытых от него полей; считаются только доступные ему записи
  const templates = await listTemplatesFor(programId, viewer);

  const result: ReportableTemplate[] = [];
  for (const t of templates) {
    const groupableFields = t.fields
      .filter((f) => f.type === 'select' || f.type === 'multiselect')
      .map((f) => ({ key: f.key, label: f.label }));

    if (groupableFields.length === 0) continue;

    const records = await listRecords(programId, t.key, undefined, viewer);
    result.push({ key: t.key, namePlural: t.namePlural, groupableFields, recordCount: records.length });
  }

  return result;
}

/** Распределение записей сущности по значениям одного поля */
export async function getFieldReport(programId: string, templateKey: string, fieldKey: string, viewer?: ViewerUser): Promise<FieldReport> {
  const templates = await listTemplatesFor(programId, viewer);
  const template = templates.find((t) => t.key === templateKey);
  if (!template) throw new ReportError('Сущность не найдена');

  const field = template.fields.find((f) => f.key === fieldKey);
  if (!field || (field.type !== 'select' && field.type !== 'multiselect')) {
    throw new ReportError('По этому полю нельзя построить отчёт');
  }

  const records = await listRecords(programId, templateKey, undefined, viewer);
  const counts = new Map<string, number>();

  for (const record of records) {
    const value = record.data[fieldKey];
    const values = Array.isArray(value) ? value : value ? [value] : [];
    if (values.length === 0) {
      counts.set('—', (counts.get('—') ?? 0) + 1);
      continue;
    }
    for (const v of values) {
      const label = String(v);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const buckets = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return { templateKey, fieldKey, fieldLabel: field.label, total: records.length, buckets };
}
