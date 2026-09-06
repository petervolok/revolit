import { PDFDocument, StandardFonts } from 'pdf-lib';
import { prisma } from '@/lib/prisma';
import { interpolate } from './template';

export type ExecInput = Record<string, unknown>;
export type ExecOutput = Record<string, unknown>;

export type Executor = (input: ExecInput, config: ExecInput) => Promise<ExecOutput>;

// Если у ноды несколько входящих рёбер, движок передаёт объект { [nodeId]: output }.
// Для блоков с одним логическим входом достаточно "развернуть" его в плоский объект.
function flattenInput(input: ExecInput): ExecInput {
  const values = Object.values(input);
  if (values.length === 1 && typeof values[0] === 'object' && values[0] !== null) {
    return values[0] as ExecInput;
  }
  return input;
}

function findAllCardIds(input: ExecInput): string[] {
  const ids: string[] = [];
  const collect = (obj: unknown) => {
    if (obj && typeof obj === 'object') {
      const record = obj as ExecInput;
      if (typeof record.cardId === 'string') ids.push(record.cardId);
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) collect(value);
      }
    }
  };
  collect(input);
  return ids;
}

export const executors: Record<string, Executor> = {
  'trigger.manual': async (input) => flattenInput(input),

  'trigger.schedule': async (input) => flattenInput(input),

  'data.card': async (input, config) => {
    const flat = flattenInput(input);
    const fieldNames = String(config.fields || '')
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    const data =
      fieldNames.length > 0
        ? Object.fromEntries(fieldNames.map((name) => [name, flat[name]]))
        : flat;
    const record = await prisma.cardRecord.create({
      data: { cardType: String(config.cardType || 'Карточка'), data: data as object },
    });
    return { cardId: record.id, ...data };
  },

  'data.relation': async (input, config) => {
    const cardIds = findAllCardIds(input);
    if (cardIds.length < 2) {
      return { skipped: true, reason: 'Недостаточно карточек для связи (нужно 2 входа)' };
    }
    const relation = await prisma.cardRelation.create({
      data: { sourceCardId: cardIds[0], targetCardId: cardIds[1], label: String(config.label || '') },
    });
    return { relationId: relation.id };
  },

  'logic.condition': async (input, config) => {
    const flat = flattenInput(input);
    const fieldValue = flat[String(config.field)];
    const compareValue = config.value;
    let result = false;
    const numField = Number(fieldValue);
    const numCompare = Number(compareValue);
    switch (config.operator) {
      case '=':
        result = String(fieldValue) === String(compareValue);
        break;
      case '>':
        result = !Number.isNaN(numField) && !Number.isNaN(numCompare) && numField > numCompare;
        break;
      case '<':
        result = !Number.isNaN(numField) && !Number.isNaN(numCompare) && numField < numCompare;
        break;
      case 'contains':
        result = String(fieldValue ?? '').includes(String(compareValue ?? ''));
        break;
    }
    return { ...flat, conditionResult: result };
  },

  'logic.reminder': async (input, config) => {
    const flat = flattenInput(input);
    const offsetDays = Number(config.offsetDays) || 0;
    const dueAt = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
    const reminder = await prisma.reminder.create({
      data: {
        cardId: typeof flat.cardId === 'string' ? flat.cardId : null,
        dueAt,
        message: interpolate(String(config.message || ''), flat),
      },
    });
    return { reminderId: reminder.id, dueAt: dueAt.toISOString() };
  },

  'action.sendEmail': async (input, config) => {
    const flat = flattenInput(input);
    const message = await prisma.outboundMessage.create({
      data: {
        channel: 'email',
        to: interpolate(String(config.to || ''), flat),
        subject: interpolate(String(config.subject || ''), flat),
        body: interpolate(String(config.body || ''), flat),
        status: 'simulated',
      },
    });
    return { messageId: message.id, status: 'simulated' };
  },

  'action.generatePdf': async (input, config) => {
    const flat = flattenInput(input);
    const text = interpolate(String(config.template || ''), flat);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { height } = page.getSize();
    page.drawText(text, { x: 50, y: height - 80, size: 12, font, maxWidth: 500, lineHeight: 16 });
    const pdfBytes = await pdfDoc.save();
    const dataBase64 = Buffer.from(pdfBytes).toString('base64');

    const file = await prisma.generatedFile.create({
      data: { name: 'document.pdf', mimeType: 'application/pdf', dataBase64 },
    });
    return { fileId: file.id };
  },

  'ui.report': async (_input, config) => {
    const rows = await prisma.cardRecord.findMany({
      where: { cardType: String(config.cardType || '') },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { rows: rows.map((r) => ({ id: r.id, ...(r.data as object) })) };
  },
};
