export const dynamic = 'force-dynamic';

import '@/modules';
import { NextResponse } from 'next/server';
import { isDenied, requirePermission } from '@revolit/core/auth/guard';
import { EntityError, addField, createRecord, createTemplate, listTemplates } from '@revolit/core/entities/service';
import type { EntityTemplateDef } from '@revolit/core/entities/types';
import { fieldChoices, revolitType, rowToApi } from '@/lab/convert';
import type { Schema } from '@/lab/convert';
import { ENTITIES, INITIAL_DATA } from '@/lab/entities';

/**
 * Лаборатория кубиков: создаёт в Revolit сущности проекта «Торговый бот» и наполняет их
 * демонстрационными записями. Только для вошедшего администратора и только при LAB_ENABLED=1.
 */
export async function POST() {
  if (process.env.LAB_ENABLED !== '1') return NextResponse.json({ error: 'Не найдено' }, { status: 404 });

  const guard = await requirePermission('entities.manage');
  if (isDenied(guard)) return guard.response;
  const programId = guard.user.programId;

  const specs = Object.values(ENTITIES).filter((e) => !e.virtual);

  try {
    const existing = await listTemplates(programId);
    if (specs.some((s) => existing.some((t) => t.name === s.name))) {
      return NextResponse.json({ error: 'Сущности проекта уже созданы (совпадают названия)' }, { status: 409 });
    }

    const templates: Record<string, EntityTemplateDef> = {};
    for (const spec of specs) {
      let template = await createTemplate(programId, { name: spec.name, namePlural: spec.namePlural });
      for (const f of spec.fields) {
        const type = revolitType(f);
        const options =
          type === 'select'
            ? { choices: fieldChoices(f) ?? [] }
            : type === 'relation'
              ? { targetTemplateId: templates[f.target ?? '']?.id ?? '' }
              : null;
        template = await addField(programId, template.key, { label: f.label, type, required: false, options });
      }
      templates[spec.key] = template;
    }

    const schema: Schema = {};
    for (const spec of specs) {
      const t = templates[spec.key];
      const realKeys: Record<string, string> = {};
      for (const f of spec.fields) {
        const real = t.fields.find((x) => x.label === f.label)?.key;
        if (real) realKeys[f.key] = real;
      }
      schema[spec.key] = { templateKey: t.key, realKeys };
    }

    // Записи: связь «попытка → растение» переносится на новые идентификаторы
    const idMap: Record<string, string> = {};
    let records = 0;
    for (const spec of specs) {
      for (const row of INITIAL_DATA[spec.key] ?? []) {
        const source: Record<string, unknown> = { ...row };
        for (const f of spec.fields) if (f.type === 'relation') source[f.key] = idMap[String(row[f.key])];
        const created = await createRecord(programId, schema[spec.key].templateKey, rowToApi(spec, schema[spec.key], source));
        idMap[row.id] = created.id;
        records++;
      }
    }

    return NextResponse.json({ ok: true, entities: specs.length, records });
  } catch (error) {
    if (error instanceof EntityError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
