'use client';

import { useState } from 'react';
import { Boxes, PanelRight, ShieldCheck, Users2 } from 'lucide-react';
import Button from '@revolit/core/ui/Button';
import EmptyState from '@revolit/core/ui/EmptyState';
import Input from '@revolit/core/ui/Input';
import SlideOver from '@revolit/core/ui/SlideOver';

export default function HomePage() {
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-7">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Новый проект</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Каркас программы готов к работе. Добавьте сущности — и они появятся в меню слева.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Users2, label: 'Пользователи', value: '1', hint: 'администратор' },
          { icon: ShieldCheck, label: 'Роли', value: '1', hint: 'полный доступ' },
          { icon: Boxes, label: 'Сущности', value: '0', hint: 'пока не добавлены' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-center gap-2 text-ink-muted">
              <card.icon className="h-4 w-4" />
              <span className="text-[13px] font-medium">{card.label}</span>
            </div>
            <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{card.value}</p>
            <p className="mt-0.5 text-xs text-ink-faint">{card.hint}</p>
          </div>
        ))}
      </div>

      <EmptyState
        icon={Boxes}
        title="В программе пока нет разделов"
        description="Сущности добавляются в конструкторе: перетащите нужную карточку — и раздел со всеми полями появится здесь автоматически."
        action={
          <Button variant="secondary" onClick={() => setPanelOpen(true)}>
            <PanelRight className="h-4 w-4" />
            Проверить панель настроек
          </Button>
        }
      />

      <SlideOver
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Настройки элемента"
        subtitle="Так выглядит правая панель редактирования"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPanelOpen(false)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={() => setPanelOpen(false)}>
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Название" defaultValue="Новый проект" />
          <Input label="Краткое описание" placeholder="Например: CRM банкетного ресторана" />
          <Input label="Адрес программы" defaultValue="my-company" hint="Программа будет доступна по этому адресу" />
        </div>
      </SlideOver>
    </div>
  );
}
