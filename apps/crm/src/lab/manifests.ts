/**
 * Манифесты кубиков — перенос catalog.yaml (21 кубик) в проверяемую форму:
 * какие слоты у кубика, что в них можно класть, какие параметры обязательны.
 * `implemented` — есть ли настоящая реализация в тестовой сборке.
 */
export interface SlotDef {
  accepts: string[];
  cardinality: 'one' | 'many';
}

export interface Manifest {
  name: string;
  category: string;
  slots: Record<string, SlotDef>;
  required: string[];
  implemented: boolean;
}

const btn: SlotDef = { accepts: ['action-button'], cardinality: 'many' };

export const MANIFESTS: Record<string, Manifest> = {
  'summary-tiles': { name: 'Ряд плашек-сводки', category: 'summary', slots: { tile: { accepts: ['metric-tile'], cardinality: 'many' } }, required: ['metrics'], implemented: true },
  'card-grid': { name: 'Сетка карточек', category: 'list', slots: { 'card-actions': btn }, required: ['entity', 'fields'], implemented: true },
  'record-table': { name: 'Таблица записей', category: 'list', slots: { 'row-actions': btn }, required: ['entity', 'columns'], implemented: true },
  'item-list': { name: 'Список объектов с прогрессом', category: 'list', slots: { 'item-actions': btn, 'item-detail': { accepts: ['detail-panel'], cardinality: 'one' } }, required: ['entity', 'fields'], implemented: true },
  'detail-panel': { name: 'Панель деталей объекта', category: 'detail', slots: { sections: { accepts: ['field-group', 'record-table', 'item-list'], cardinality: 'many' }, 'panel-actions': btn }, required: ['entity'], implemented: true },
  'section-tabs': { name: 'Вкладки секций страницы', category: 'nav', slots: { 'tab-content': { accepts: ['record-table', 'item-list', 'settings-form', 'detail-panel', 'field-group', 'inline-editor'], cardinality: 'many' } }, required: ['tabs'], implemented: false },
  'modal-editor': { name: 'Модальный редактор', category: 'form', slots: { 'form-fields': { accepts: ['field-input'], cardinality: 'many' } }, required: ['entity', 'mode', 'onSubmit'], implemented: true },
  'inline-editor': { name: 'Встроенный редактор', category: 'form', slots: {}, required: ['entity', 'fields'], implemented: false },
  'wizard-form': { name: 'Пошаговая форма создания', category: 'form', slots: { 'step-content': { accepts: ['field-group', 'record-table', 'tree-catalog', 'seating-map', 'item-list'], cardinality: 'many' } }, required: ['entity', 'steps', 'onComplete'], implemented: false },
  'settings-form': { name: 'Форма настроек', category: 'form', slots: {}, required: ['fields'], implemented: true },
  'filter-bar': { name: 'Строка фильтров', category: 'filter', slots: {}, required: ['filters'], implemented: false },
  'criteria-builder': { name: 'Конструктор условий фильтрации', category: 'filter', slots: {}, required: ['availableFields'], implemented: false },
  'nested-list': { name: 'Список с дочерними элементами', category: 'list', slots: { 'parent-actions': btn, 'child-actions': btn }, required: ['parentEntity', 'childEntity', 'parentFields', 'childFields'], implemented: false },
  'async-job-card': { name: 'Карточка фонового процесса', category: 'summary', slots: { 'job-actions': btn }, required: ['jobRef', 'metrics'], implemented: false },
  'progress-indicator': { name: 'Индикатор прогресса', category: 'other', slots: {}, required: ['operationRef'], implemented: true },
  'log-viewer': { name: 'Просмотр текстового лога', category: 'other', slots: {}, required: ['logRef'], implemented: false },
  'calendar-grid': { name: 'Сетка календаря', category: 'calendar', slots: { 'event-detail': { accepts: ['detail-panel', 'modal-editor'], cardinality: 'one' } }, required: ['entity', 'dateField', 'titleField'], implemented: false },
  'seating-map': { name: 'Карта расстановки объектов', category: 'other', slots: {}, required: ['entity', 'canvasWidth', 'canvasHeight', 'xField', 'yField'], implemented: false },
  'tree-catalog': { name: 'Иерархический каталог с выбором', category: 'list', slots: { 'selected-items': { accepts: ['record-table'], cardinality: 'one' } }, required: ['entity', 'categoryField'], implemented: false },
  'action-button': { name: 'Кнопка действия', category: 'other', slots: {}, required: ['label', 'action'], implemented: true },
  'status-badge': { name: 'Бейдж статуса', category: 'other', slots: {}, required: ['value'], implemented: false },
};
