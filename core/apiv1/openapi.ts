/**
 * Описание публичного API в формате OpenAPI 3.0 — собирается из сущностей программы, поэтому всегда
 * совпадает с тем, что настроено сейчас, и отдаёт только то, что видно владельцу токена (скрытых
 * полей и недоступных сущностей в описании нет). По нему клиенты и документация строятся автоматически.
 */
import type { EntityFieldDef, EntityTemplateDef } from '../entities/types';
import { FILTER_OPS } from '../entities/query';

type Json = Record<string, unknown>;

/** Схема значения поля */
export function fieldSchema(f: EntityFieldDef): Json {
  const v = f.validation;
  const base: Json = {};
  if (f.description) base.description = f.description;
  if (f.readonly) base.readOnly = true;

  switch (f.type) {
    case 'text':
    case 'longtext':
    case 'phone':
      return { type: 'string', ...(v.minLength !== undefined ? { minLength: v.minLength } : {}), ...(v.maxLength !== undefined ? { maxLength: v.maxLength } : {}), ...(v.pattern ? { pattern: v.pattern } : {}), ...base };
    case 'email':
      return { type: 'string', format: 'email', ...base };
    case 'url':
      return { type: 'string', format: 'uri', ...base };
    case 'number':
      return { type: v.integer ? 'integer' : 'number', ...(v.min !== undefined ? { minimum: Number(v.min) } : {}), ...(v.max !== undefined ? { maximum: Number(v.max) } : {}), ...base };
    case 'boolean':
      return { type: 'boolean', ...base };
    case 'date':
      return { type: 'string', format: 'date', ...base };
    case 'datetime':
      return { type: 'string', format: 'date-time', ...base };
    case 'select':
      return { type: 'string', enum: (f.options as { choices: string[] } | null)?.choices ?? [], ...base };
    case 'multiselect':
      return { type: 'array', items: { type: 'string', enum: (f.options as { choices: string[] } | null)?.choices ?? [] }, ...base };
    case 'relation':
    case 'user':
      return { type: 'string', description: f.type === 'user' ? 'Идентификатор сотрудника' : 'Идентификатор связанной записи', ...base };
    case 'relations':
      return { type: 'array', items: { type: 'string' }, description: 'Идентификаторы связанных записей', ...base };
    case 'json':
      return { description: f.description ?? 'Любое значение JSON' };
    default:
      return base;
  }
}

function schemaName(t: EntityTemplateDef): string {
  const name = t.key.replace(/[^A-Za-z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : ''));
  return name ? name[0].toUpperCase() + name.slice(1) : 'Entity';
}

const ERROR_REF = { $ref: '#/components/schemas/Error' };

function errorResponses(codes: number[]): Json {
  const text: Record<number, string> = {
    400: 'Данные не прошли проверку', 401: 'Нет токена или он недействителен', 403: 'Недостаточно прав',
    404: 'Не найдено', 429: 'Слишком много запросов',
  };
  return Object.fromEntries(codes.map((c) => [String(c), { description: text[c], content: { 'application/json': { schema: ERROR_REF } } }]));
}

export function buildOpenApi(templates: EntityTemplateDef[], serverUrl: string): Json {
  const schemas: Json = {
    Error: {
      type: 'object',
      properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'] } },
      required: ['error'],
    },
    ListMeta: {
      type: 'object',
      properties: { total: { type: 'integer' }, page: { type: 'integer' }, pageSize: { type: 'integer' }, pages: { type: 'integer' } },
    },
  };
  const paths: Json = {
    '/entities': {
      get: {
        summary: 'Список сущностей с описанием полей',
        tags: ['Сущности'],
        responses: { '200': { description: 'Сущности, доступные владельцу токена' }, ...errorResponses([401, 429]) },
      },
    },
  };

  const filterParam = {
    name: 'filter',
    in: 'query',
    style: 'deepObject',
    explode: true,
    description: `Условия: filter[поле][операция]=значение. Операции: ${FILTER_OPS.join(', ')}. Без операции — «равно».`,
    schema: { type: 'object', additionalProperties: { type: 'string' } },
  };
  const listParams = [
    { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Поиск по всем полям' },
    { name: 'sort', in: 'query', schema: { type: 'string' }, description: 'Поле сортировки; минус впереди — по убыванию, например -price' },
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
    { name: 'pageSize', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200, default: 25 } },
    filterParam,
  ];

  for (const t of templates) {
    const name = schemaName(t);
    const fields = t.fields;
    const properties = Object.fromEntries(fields.map((f) => [f.key, fieldSchema(f)]));
    const required = fields.filter((f) => f.required && !f.hasDefault && !f.readonly).map((f) => f.key);

    schemas[`${name}Data`] = { type: 'object', properties, ...(required.length ? { required } : {}) };
    schemas[`${name}Input`] = {
      type: 'object',
      properties: { data: { $ref: `#/components/schemas/${name}Data` } },
      required: ['data'],
    };
    schemas[name] = {
      type: 'object',
      properties: {
        id: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        data: { $ref: `#/components/schemas/${name}Data` },
      },
    };

    const tag = [t.namePlural];
    const can = t.access ?? { create: true, update: true, delete: true };
    const base = `/entities/${t.key}/records`;
    const record = { $ref: `#/components/schemas/${name}` };
    const input = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}Input` } } } };
    const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string' } };

    const collection: Json = {
      get: {
        summary: `${t.namePlural}: список с поиском, фильтрами, сортировкой и страницами`,
        tags: tag,
        parameters: listParams,
        responses: {
          '200': {
            description: 'Страница записей',
            content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'array', items: record }, meta: { $ref: '#/components/schemas/ListMeta' } } } } },
          },
          ...errorResponses([400, 401, 403, 429]),
        },
      },
    };
    if (can.create) {
      collection.post = {
        summary: `${t.namePlural}: создать запись`,
        tags: tag,
        requestBody: input,
        responses: { '201': { description: 'Созданная запись', content: { 'application/json': { schema: { type: 'object', properties: { data: record } } } } }, ...errorResponses([400, 401, 403, 429]) },
      };
    }
    paths[base] = collection;

    const item: Json = {
      get: {
        summary: `${t.namePlural}: получить запись`,
        tags: tag,
        parameters: [idParam],
        responses: { '200': { description: 'Запись', content: { 'application/json': { schema: { type: 'object', properties: { data: record } } } } }, ...errorResponses([401, 403, 404, 429]) },
      },
    };
    if (can.update) {
      item.patch = {
        summary: `${t.namePlural}: изменить запись (передаются только меняемые поля; null очищает поле)`,
        tags: tag,
        parameters: [idParam],
        requestBody: input,
        responses: { '200': { description: 'Запись после изменения', content: { 'application/json': { schema: { type: 'object', properties: { data: record } } } } }, ...errorResponses([400, 401, 403, 404, 429]) },
      };
    }
    if (can.delete) {
      item.delete = {
        summary: `${t.namePlural}: удалить запись`,
        tags: tag,
        parameters: [idParam],
        responses: { '204': { description: 'Удалено' }, ...errorResponses([401, 403, 404, 429]) },
      };
    }
    paths[`${base}/{id}`] = item;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Revolit API',
      version: '1',
      description:
        'Доступ к данным программы по токену. Токен выпускается в «Настройки → API», передаётся в заголовке ' +
        'Authorization: Bearer <токен> и действует с правами сотрудника, который его выпустил.',
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, '')}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }, schemas },
    paths,
  };
}
