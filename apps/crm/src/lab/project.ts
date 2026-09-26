import type { Project } from './types';

/** Дословный перенос project.yaml («Торговый бот») — дерево кубиков без изменений. */
export const PROJECT: Project = {
  name: 'Торговый бот',
  domain:
    'Автоматическая торговля криптовалютными фьючерсами на бирже Bybit. Пользователь создаёт стратегии, бот торгует по ним, AI и эволюционный алгоритм генерируют и улучшают новые стратегии.',
  screens: [
    {
      key: 'constructor',
      name: 'Конструктор стратегий',
      layout: [
        {
          cube: 'summary-tiles',
          props: {
            metrics: [
              { label: 'Всего сделок', field: 'trades_total', format: 'number' },
              { label: '% побед', field: 'win_rate', format: 'percent' },
              { label: 'Общий PnL', field: 'pnl_total', format: 'currency' },
              { label: 'PnL сегодня', field: 'pnl_today', format: 'currency' },
            ],
          },
        },
        {
          cube: 'card-grid',
          props: {
            entity: 'Strategy',
            fields: ['name', 'enabled', 'symbols', 'timeframe', 'trades_total', 'win_rate', 'pnl_total'],
            onCardClick: 'open-modal-editor',
          },
          slots: {
            'card-actions': [
              { cube: 'action-button', props: { label: 'Вкл/Выкл', action: 'toggle-enabled', variant: 'ghost' } },
              { cube: 'action-button', props: { label: 'Удалить', action: 'delete-strategy', variant: 'danger', confirmRequired: true } },
            ],
          },
        },
        {
          cube: 'modal-editor',
          props: { entity: 'Strategy', mode: 'create', dynamicFields: true, onSubmit: 'save-strategy' },
        },
        {
          cube: 'record-table',
          props: {
            entity: 'Position',
            columns: ['symbol', 'side', 'qty', 'entry_price', 'mark_price', 'sl', 'tp', 'leverage', 'margin', 'unrealized_pnl'],
            colorRules: [
              { field: 'side', value: 'Buy', color: 'green' },
              { field: 'side', value: 'Sell', color: 'red' },
            ],
          },
          slots: {
            'row-actions': [
              { cube: 'action-button', props: { label: 'Закрыть', action: 'close-position', variant: 'danger', confirmRequired: true } },
            ],
          },
        },
      ],
    },
    {
      key: 'garden',
      name: 'Эволюционный сад',
      layout: [
        {
          cube: 'summary-tiles',
          props: {
            metrics: [
              { label: 'Живых растений', field: 'plants_alive', format: 'number' },
              { label: 'Мёртвых', field: 'plants_dead', format: 'number' },
              { label: 'Фруктов', field: 'fruits_total', format: 'number' },
              { label: 'Всего', field: 'plants_total', format: 'number' },
            ],
          },
        },
        { cube: 'action-button', props: { label: 'Посеять семя', action: 'seed-new-plant', variant: 'primary' } },
        {
          cube: 'item-list',
          props: {
            entity: 'Plant',
            fields: ['name', 'phase', 'generation', 'try_no', 'streak_fail', 'metrics_summary'],
            statusField: 'phase',
            onItemClick: 'open-detail-panel',
          },
          slots: {
            'item-actions': [
              { cube: 'action-button', props: { label: 'Шаг', action: 'plant-step', variant: 'ghost' } },
              { cube: 'action-button', props: { label: 'Оживить', action: 'plant-revive', variant: 'ghost' } },
              { cube: 'action-button', props: { label: 'Удалить', action: 'plant-delete', variant: 'danger', confirmRequired: true } },
            ],
            'item-detail': [
              {
                cube: 'detail-panel',
                props: { entity: 'Plant', layout: 'inline-below' },
                slots: {
                  sections: [
                    {
                      cube: 'record-table',
                      props: {
                        entity: 'PlantRun',
                        columns: ['try_no', 'gene_key', 'old_value', 'new_value', 'verdict', 'profit_factor', 'reason'],
                        colorRules: [
                          { field: 'verdict', value: 'better', color: 'green' },
                          { field: 'verdict', value: 'worse', color: 'red' },
                        ],
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
    {
      key: 'champions',
      name: 'Сад чемпионов',
      layout: [
        {
          cube: 'card-grid',
          props: {
            entity: 'Champion',
            fields: ['name', 'description', 'symbol', 'timeframe', 'profit_factor', 'win_rate', 'enabled'],
            onCardClick: 'open-detail-panel',
          },
          slots: {
            'card-actions': [
              { cube: 'action-button', props: { label: 'Включить в торговлю', action: 'champion-enable', variant: 'primary' } },
            ],
          },
        },
      ],
    },
    {
      key: 'sandbox',
      name: 'Песочница данных',
      layout: [
        { cube: 'action-button', props: { label: 'Скачать новый датасет', action: 'open-create-dataset', variant: 'primary' } },
        { cube: 'modal-editor', props: { entity: 'Dataset', mode: 'create', onSubmit: 'build-dataset' } },
        {
          cube: 'record-table',
          props: { entity: 'Dataset', columns: ['symbol', 'timeframe', 'target_bars', 'bars_actual', 'source', 'updated_at'] },
          slots: {
            'row-actions': [
              { cube: 'action-button', props: { label: 'Обновить', action: 'dataset-update', variant: 'ghost' } },
              { cube: 'action-button', props: { label: 'Изменить размер', action: 'dataset-resize', variant: 'ghost' } },
              { cube: 'action-button', props: { label: 'Удалить', action: 'dataset-delete', variant: 'danger', confirmRequired: true } },
            ],
          },
        },
        {
          cube: 'progress-indicator',
          props: { operationRef: '/api/sandbox/build/status', label: 'Скачивание исторических данных...' },
        },
      ],
    },
    {
      key: 'ai-settings',
      name: 'Настройки AI',
      layout: [
        {
          cube: 'settings-form',
          props: {
            fields: [
              { key: 'openai_api_key', label: 'OpenAI API Key', type: 'password' },
              { key: 'anthropic_api_key', label: 'Anthropic API Key', type: 'password' },
              { key: 'gemini_api_key', label: 'Google Gemini Key', type: 'password' },
            ],
            saveMode: 'button',
          },
        },
      ],
    },
  ],
};
