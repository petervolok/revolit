# Revolit: описание системы для ИИ-агента, пишущего плагин

Документ самодостаточен. Всё, что здесь сказано о коде, проверено по исходникам на 19.09.2026.
Если нужно решение «почему так» — `docs/08-decisions.md` (записи Р-N). Если документ и код
расходятся — прав код.

## 1. Что это

Платформа сборки корпоративных систем без программирования. Продукт сейчас один — **CRM-конструктор**
(`apps/crm`) на общем **ядре** (`core`). Клиент ставит одну копию на свой сервер (Docker), внутри —
одна «программа» (Program) со своими сотрудниками, ролями и данными. Пользователь собирает разделы
в интерфейсе: **сущности** (таблицы с полями), **процессы** (этапы + дела на доске); поверх идут
подключаемые **модули** («плагины»): ИИ-консультант, отчёты, задачи. Вложения и связи — сквозные
возможности ядра.

Стек: Next.js 14 (App Router, standalone), React 18, TypeScript strict, Prisma 5 + PostgreSQL 16,
Tailwind, lucide-react, npm workspaces. Язык интерфейса, комментариев и документации — **русский**.

## 2. Ключевые принципы (нарушать нельзя)

1. **Расширения — данные, а не код (Р-19).** Сущность, поле, шаблон, процесс, этап — строки в общих
   таблицах, применяются без пересборки. Отдельные таблицы Postgres под пользовательскую сущность
   не создаются. Запись сущности = одна строка с JSON `data`.
2. **Плагин — это код, вкомпилированный в сборку.** Динамической загрузки плагинов в запущенный
   контейнер нет и быть не может (Next.js). Плагин добавляется правкой исходников и пересборкой
   образа. «Витрина плагинов» лишь включает/выключает уже вкомпилированное (`ModuleToggle`, Р-34).
3. **Всё привязано к программе.** Каждая выборка фильтруется по `programId` пользователя
   (`guard.user.programId`). Ни одного запроса без него. Идентификатор из URL/тела всегда проверяется
   на принадлежность программе.
4. **Три рубежа доступа (обязательно):** обработчик запроса → страница → пункт меню. Скрытие меню
   защитой не считается. Выключенный плагин обязан блокироваться и в API, и на странице.
5. **Секреты:** пишутся, но не возвращаются клиенту (только признак «задан»/последние 4 символа).
   Хранятся в БД (не в переменных окружения, не в файлах проекта — папка синхронизируется в облако).
6. **Честность о возможностях.** Не выдавать заглушку за функцию: в интерфейсе и в документации явно
   писать, чего плагин НЕ делает.
7. **Минимализм.** Без лишних абстракций, без зависимостей ради мелочи (drag-and-drop — нативный
   HTML5, диаграммы — CSS). Комментарии только про «почему».

## 3. Устройство репозитория

```
core/                    ядро, поставляется исходниками (transpilePackages)
  index.ts               БРАУЗЕРНЫЙ вход '@revolit/core'  (типы, реестр, модули, nav-хелперы, AppShell)
  server.ts              СЕРВЕРНЫЙ вход '@revolit/core/server' (prisma, сессия, сервисы, порты)
  auth/  session.ts guard.ts page-guard.ts permissions.ts audit.ts crypto.ts config.ts
  modules/               types.ts registry.ts current.ts toggles.ts catalog.ts coreModule.ts aiModule.ts reportsModule.ts tasksModule.ts
  entities/ processes/ tasks/ attachments/ ai/ reports/ dashboard/ licensing/ updates/   доменные сервисы (service.ts + types.ts)
  ports/                 mail.ts smtp.ts storage.ts registry.ts types.ts  (сменные части)
  events/                bus.ts coreEvents.ts
  api/<feature>/route.ts       реальные обработчики запросов
  screens/*Screen.tsx (сервер, гард) + *Client.tsx ('use client', UI)
  ui/                    Badge Button Checkbox EmptyState Input RowMenu Select SlideOver
  prisma/core.prisma     модели ядра
apps/crm/
  src/modules/index.ts   СБОРКА: список подключённых модулей → createRegistry → setRegistry
  src/modules/crmModule.ts
  src/app/api/**/route.ts        тонкие реэкспорты обработчиков
  src/app/(shell)/**/page.tsx    тонкие реэкспорты экранов (внутри оболочки с меню)
  src/app/(shell)/layout.tsx     серверный макет: сессия, динамические пункты меню, disabledModules
  src/shell/AppChrome.tsx        клиент: собирает меню registry.menu(perms, disabledSet)
  src/middleware.ts              cookie-отсечка ТОЛЬКО для /home /settings /profile
  prisma/base.prisma crm.prisma  генератор/источник данных; модели приложения
  prisma/migrations/             ВСЕ миграции (общие для всех частей схемы)
  scripts/build-schema.js        склеивает base + core + crm → prisma/schema.prisma (файл в .gitignore)
tools/ docs/ .github/workflows/ci.yml
```

Импорты: `@revolit/core` (браузер-безопасно), `@revolit/core/server` (только сервер: куки, БД, почта),
`@revolit/core/<путь>` (любой файл ядра), `@/…` (src приложения). Серверный код в браузерном
входе ломает сборку — соблюдать разделение.

## 4. Модель данных (Prisma, PostgreSQL)

Идентификаторы — `cuid()` (String). Все доменные таблицы несут `programId`.

| Модель | Суть / важные поля |
|---|---|
| `Program` | slug, name. Корень мультитенантности; в экземпляре обычно одна |
| `User` | programId, email, name, passwordHash, isActive, mustChangePassword, failedAttempts, lockedUntil |
| `Role` | programId, key, name, `permissions String[]`, isSystem. Админ имеет `['*']` |
| `UserRole`, `Session`, `LoginCode`, `PasswordResetToken`, `AuditLog` | вход и журнал |
| `EntityTemplate` | programId, key(латиница), name, namePlural, sourcePresetKey |
| `EntityField` | templateId, key, label, type (`text number date select multiselect relation user`), required, options JSON, order |
| `EntityRecord` | programId, templateId, `data Json` |
| `EntityTemplatePreset` | каталог шаблонов сущностей (24 шт.), fields JSON |
| `ProcessTemplate` / `ProcessStage` | key, name / order, name, responsible(текст), regulation, checklist JSON `[{label}]` |
| `ProcessInstance` | templateId, title, currentStageId, status (`active done cancelled`), checklistState JSON, entityRecordId? |
| `ProcessHistoryEntry` | переходы дела между этапами |
| `Task` | title, description, assigneeId?, createdById?, dueAt?, status (`open done`), entityRecordId?, processInstanceId? |
| `Attachment` | storageKey, fileName, mimeType, size, uploadedById?, ровно один родитель: entityRecordId / processInstanceId / taskId (Cascade) |
| `ProgramSettings` | 1:1 с Program: mail*, appUrl, licenseKey, activeAiGroupId |
| `AiKeyGroup` / `AiKey` | группы ключей ИИ и сами ключи (apiKey не возвращается клиенту) |
| `ModuleToggle` | programId+moduleKey, enabled. **Нет строки = модуль включён** |

Правила данных: структуру сущности (поля) и процесса (этапы) нельзя менять, пока есть записи/дела
(проверяется на сервере); связи с записями/делами — мягкие (`SetNull`), вложение — жёсткая (`Cascade`).

## 5. Контракт плагина

### 5.1 Манифест (`core/modules/types.ts`)

```ts
export interface ModuleManifest {
  key: string; name: string; version: string;            // key уникален, латиница
  requiresCore: string;                                   // '>=1.0.0' (CORE_VERSION = 1.0.0)
  description?: string;
  dependsOn?: string[];                                   // ключи других модулей; нет — модуль отключается
  permissions?: { key: string; label: string; group: string }[];
  menu?: { section: string; sectionTitle?: string; sectionOrder?: number;
           key: string; label: string; href: string; icon: LucideIcon;
           permission?: string; order?: number; children?: {key,label,href,permission?}[] }[];
  settings?: { key: string; title: string; description: string; href: string;
               icon: LucideIcon; permission: string; order?: number }[];   // карточки на /settings
  register?: (ctx: { events: EventBus<CoreEventMap> }) => void;              // один раз при старте
}
```

Реестр (`createRegistry`) отбрасывает модуль с несовместимой версией ядра или ненайденной
зависимостью (сообщение в лог), остальных не роняет. Метки происхождения (`moduleKey`) хранятся,
поэтому `registry.menu(perms, disabledSet)` и `registry.settings(perms, disabledSet)` прячут
вклады выключенных модулей.

**Реальные ограничения манифеста (не выдумывать иного):**
- Порядок пунктов внутри секции — по `order` (по умолчанию 100, меньше — выше); при равных значениях
  сохраняется порядок модулей в `createRegistry([...])`. Занято в секции `main`: Главная 10, Задачи 40,
  ИИ-консультант 50, Отчёты 60. `sectionOrder` — порядок самих секций (у `admin` = 900, у `main` в crmModule = 10).
- Дочерние пункты («Настройки → …») задаёт только `coreModule`; чужой модуль добавить в него
  ребёнка не может. Плагин показывается карточкой в `settings` и/или собственным пунктом меню.
- Динамические пункты (список сущностей/процессов) собираются в `layout.tsx` + `AppChrome.tsx`
  мимо реестра. Плагину с собственным динамическим меню нужно править эти два файла.
- События ядра (`CoreEventMap`) вызываются: `user.created/updated/deactivated/activated`
  (`api/users`), `role.created/updated/deleted` (`api/roles`), `auth.logged_in` (`auth/verify`),
  `auth.logged_out`, `auth.password_changed` (смена в профиле и сброс по ссылке). Эмиссия идёт после
  записи в журнал; сбой подписчика операцию не срывает. Не эмитятся: события сущностей, процессов,
  задач, вложений и настроек — если плагину они нужны, добавить `emit` в соответствующий сервис.
  Живьём проверен только `user.created` (подписчик в `crmModule`).
- Расписание: таблица `ScheduledJob` (`upsertJob`, `ensureJob` для плагинов, cron из 5 полей, UTC со сдвигом `SCHEDULER_UTC_OFFSET_MINUTES`); раннер живёт в агенте №1 и публикует `scheduler.job.fired` — подписывайтесь и фильтруйте по `jobKey`. Работает только при `DATA_MODE=bus`; срабатывания не догоняются, доставка «не больше одного раза». Очередей, вебхуков и исполнения действий по событию по-прежнему нет.

### 5.2 Где жить плагину

- **Кастомная реализация под клиента → в `apps/crm`** (не в `core`, чтобы не попадать в общее ядро):
  манифест `apps/crm/src/modules/<key>Module.ts`, обработчики прямо в `apps/crm/src/app/api/<key>/…`,
  экраны прямо в `apps/crm/src/app/(shell)/<key>/…`, доменная логика `apps/crm/src/plugins/<key>/`.
  Импортировать из `@revolit/core` и `@revolit/core/server`.
- **Универсальный плагин для всех клиентов → в `core`** по образцу `tasksModule`/`reportsModule`
  (реэкспорты в `apps/crm/src/app/**` обязательны, т.к. Next видит маршруты только под `apps/crm/src/app`).

### 5.3 Чек-лист добавления плагина `<key>`

1. **Схема.** Модели в `apps/crm/prisma/crm.prisma` (или новый файл + строка в массиве `parts`
   в `scripts/build-schema.js`). Связь с `Program`/`User`/`EntityRecord` через `@relation` требует
   обратного поля в `core.prisma` (правка ядра). Чтобы не трогать ядро — хранить `programId String`
   (+ `@@index`) **без `@relation`** и проверять принадлежность в сервисе (так сделан `activeAiGroupId`).
   Между собственными моделями плагина `@relation` свободно. Каскад на удаление Program при этом теряется.
2. **Миграция.** `npx prisma migrate dev --name <что_сделано>` (см. §10). При переносе данных —
   `--create-only`, правка SQL вручную, затем применение. Миграции только вперёд, руками БД не править.
3. **Сервис** `service.ts` + `types.ts` (типы без серверных импортов — их берёт и браузер).
4. **Права.** Ключи `<key>.<глагол>`, группа `'Плагины'`. Одно право на функцию (Р-20), не дробить.
5. **Манифест** + добавить в `createRegistry([...])` в `apps/crm/src/modules/index.ts`.
6. **Каталог витрины:** запись `{key, name, description, version}` в `core/modules/catalog.ts`
   (ключ = `manifest.key`), иначе плагин нельзя будет выключить в «Настройки → Плагины».
7. **Обработчики API** с тремя проверками (§7). 8. **Экран** (серверный гард + клиент) и страница-реэкспорт.
9. **Документация:** запись `Р-N` в `docs/08-decisions.md` (что решено, почему, что НЕ сделано);
   если плагин добавляет возможности — обновить `core/ai/systemContext.ts` (описание платформы для
   ИИ-консультанта пишется вручную; иначе он будет советовать несуществующее).
10. Проверки §12.

## 6. Шаблоны кода

**Обработчик** (`.../api/<key>/route.ts`):
```ts
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, isDenied, assertModuleEnabled, ModuleToggleError } from '@revolit/core/server';
// (в core: относительные импорты '../../auth/guard', '../../modules/toggles')

export async function GET(req: NextRequest) {
  const guard = await requirePermission('<key>.use');
  if (isDenied(guard)) return guard.response;                       // 401/403 уже сформированы
  try { await assertModuleEnabled(guard.user.programId, '<key>'); }
  catch (e) { if (e instanceof ModuleToggleError) return NextResponse.json({ error: e.message }, { status: 403 }); throw e; }
  const data = await listThings(guard.user.programId);              // всегда programId
  return NextResponse.json(data);
}
// POST: тело — await req.json().catch(() => ({})); проверять типы вручную; ошибки домена
// (class XError extends Error) → NextResponse.json({ error }, { status: 400 }); прочее — throw.
```
Динамические сегменты: `{ params }: { params: { id: string } }`. Загрузка файла — `req.formData()`.
Права зависящие от родителя проверять через `getCurrentUser()` + `hasPermission(user, perm)`.

**Страница** — `apps/crm/src/app/(shell)/<key>/page.tsx`:
```ts
import '@/modules';                                   // ОБЯЗАТЕЛЬНО: собирает реестр до обращения к нему
export { default } from '<путь к серверному экрану>';
```
(каждый route.ts и page.tsx начинается с `import '@/modules'`.)

**Серверный экран:**
```tsx
const user = await requirePageAccess('<key>.use');               // редирект на /login или /home
if (!(await isModuleEnabled(user.programId, '<key>'))) redirect('/home');
return <ThingsClient currentUserId={user.id} />;
```
**Клиент** — `'use client'`, данные через `fetch('/api/<key>…')`, состояния: загрузка (`return null`),
пусто (`EmptyState`), ошибка (красная плашка), баннер успеха. Оптимистичные обновления — с откатом `load()`.

**Журнал действий:** `writeAudit({programId,userId,actorEmail,action,target,targetId,details})`
(`core/auth/audit.ts`). `AuditAction` — закрытый union: новые действия добавлять в него. Писать
всё, что меняет доступ или удаляет данные пользователя. Ошибка записи журнал не роняет.

## 7. Доступ и безопасность

- **Сессия:** cookie `revolit_session` (httpOnly, Secure в проде — вход только по https), в БД хэш токена.
  `getCurrentUser()` → `{id, programId, email, name, roles[], permissions[]}` или null.
  `hasPermission(user, p)`: `'*'` даёт всё. Вход: пароль + код на почту; блок после 5 неудач на 15 мин.
- **API:** `requirePermission(p)` → `{user}` | `{response}`; проверять `isDenied`. **Страница:**
  `requirePageAccess(p)`. **Меню:** `permission` в манифесте.
- **Лицензия (платные модули):** `hasFeature('<featureKey>')` (серверная, проверяет подписанный
  ключ Ed25519 без обращения к сети). Платный плагин: проверять и в API, и на странице; ключ фичи
  выпускает `tools/issue-license.js`. Что платно, а что бесплатно — не решено (открытый вопрос дорожной карты).
- Ввод пользователя валидировать на границе (тело запроса, id из URL); внутренним вызовам доверять.
  Не собирать SQL строками (Prisma). Файлы — только через `StoragePort` (защита от выхода из папки есть).
- Ответы не должны раскрывать существование учётных записей. Сообщения ошибок — по-русски, без стека.

## 8. Что плагин получает от ядра (серверные вызовы, `@revolit/core/server`)

| Область | Функции |
|---|---|
| Доступ | `getCurrentUser hasPermission createSession destroySession requirePermission isDenied requirePageAccess` |
| Данные | `prisma`, `getCurrentProgram()`, `getCurrentSettings()` (`core/data/settings`) |
| Сущности | `listTemplates getTemplate createTemplate addField updateField … listRecords(programId,templateKey) createRecord(programId,templateKey,data) updateRecord deleteRecord`; ошибка `EntityError`. Значения проходят валидацию по типам полей |
| Процессы | `listProcessTemplates createInstance(programId,templateKey,{title,entityRecordId?}) moveInstance setInstanceStatus toggleChecklistItem listInstances listInstancesForRecord …`; `ProcessError` |
| Задачи | `listTasks createTask updateTask setTaskStatus deleteTask`; `TaskError` |
| Вложения | `listAttachments uploadAttachment getAttachmentFile deleteAttachment`; лимит 15 МБ (`MAX_ATTACHMENT_SIZE`); `AttachmentError` |
| Плагины | `listDisabledModuleKeys isModuleEnabled assertModuleEnabled setModuleEnabled` |
| ИИ | `consult(programId,message,history)`, группы ключей; провайдеры anthropic/openai/gemini, при HTTP 429 переключает ключ группы |
| Почта | `sendMail({to,subject,text,html?})` — берёт SMTP из `ProgramSettings`, иначе из env, иначе пишет письмо в лог контейнера |
| Хранилище | `getStoragePort()` → `put(key,Buffer,mime) get delete url`; по умолчанию диск `STORAGE_DIR`; заменяется `setStoragePort()` в `register()` |
| Лицензия | `getLicenseStatus activateLicense hasFeature` |
| Отчёты | `listReportableTemplates getFieldReport` |
Общее: `recordLabel(record, fields)` (`@revolit/core`) — подпись записи (первое текстовое поле, иначе первое непустое).
Связь плагина с сущностями: хранить `entityRecordId`/`processInstanceId` мягко (`SetNull`) и проверять
`programId` записи, как в `createTask`.

## 9. Интерфейс

Токены Tailwind (тёмная/светлая темы через CSS-переменные, обязательны обе): `bg-surface`, `bg-surface-muted`,
`bg-surface-raised`, `border-line`, `text-ink` / `text-ink-muted` / `text-ink-faint`, `bg-brand`
`hover:bg-brand-hover` `bg-brand-soft`, `text-danger`, `text-success`, `text-2xs`, `shadow-panel|popover`.
Не писать цвета поштучно.

Компоненты `core/ui` (`import X from '../ui/X'`; в приложении — `@revolit/core/ui/X`):
`Button` (variant primary|secondary|ghost|danger, size sm|md|lg, `loading`), `Input` (label, hint, error,
leading, trailing, обычные input-props), `Select` (label, hint, error; дети `<option>`), `Checkbox`
(`checked onChange(bool) label hint`), `Badge` (tone neutral|brand|success|warning|danger),
`EmptyState` (icon,title,description,action), `RowMenu` (items `{label,onClick,icon?,danger?,hidden?}`),
`SlideOver` (open,onClose,title,subtitle?,width sm|md|lg,footer?) — правая выезжающая панель, Esc закрывает.
Иконки — `lucide-react`. Утилита `cn` (`core/utils/cn`).

Паттерны: страница `mx-auto max-w-2xl|3xl|5xl`, заголовок `text-lg font-semibold text-ink`, описание
`text-[13px] text-ink-muted`; формы создания/правки — в `SlideOver`; удаление — `confirm()` + красный цвет;
все три состояния (загрузка/пусто/ошибка) обязательны; клавиатура и фокус не ломать.
Готовый переиспользуемый блок вложений: `core/attachments/AttachmentsSection.tsx`
(`<AttachmentsSection parent={{ entityRecordId }} />` или `processInstanceId`/`taskId`).

## 10. Окружение и команды

Разработка идёт в Docker (на хосте Windows Node.js нет). `docker compose up -d` → app `:3210`, MailHog `:8026`,
БД `:15432`. Все команды — внутри контейнера:
```
docker compose exec app sh -lc "cd apps/crm && npm run schema && npx prisma generate"   # после правки *.prisma, до typecheck
docker compose exec app sh -lc "cd apps/crm && npm run typecheck"
docker compose exec app sh -lc "cd apps/crm && npx prisma migrate dev --name <имя>"      # (--create-only для ручной правки SQL)
docker compose restart app          # dev-сервер не видит НОВЫЕ файлы (Docker на Windows) — правки существующих подхватывает
docker build -t revolit-app:test .  # настоящая проверка production-сборки (dev-контейнер сборку не проходит)
```
Dev-вход: `admin@revolit.local`, код письма — в MailHog. `STORAGE_DIR=/app/storage` (том). Prod-контейнер
сам применяет миграции при старте (`docker-entrypoint.sh`). Ловушки: кириллица в аргументах shell портится
(передавать JSON из файла `--data-binary @file`); `localhost` внутри prod-контейнера не отвечает (Next
слушает интерфейс контейнера); Prisma-клиент надо пересобрать `prisma generate` после правки схемы, иначе
typecheck падает на «свойство не существует»; `tar`-перенос на сервер — только с `--exclude='.env*'`
(секреты у окружений свои); удалённые локально файлы на сервере сами не исчезают.

## 11. Соглашения

Русский язык интерфейса/комментариев/документации; идентификаторы — латиница. Комментарий — только «почему»,
не «что». Именование ошибок домена: `class <Область>Error extends Error`. Тексты ошибок пользователю — по-русски.
Ключи/slug — латиница (`slugify` в `core/entities/types.ts`). Решения фиксируются в `docs/08-decisions.md`
(новая запись, старые не переписываются). Отчётность честная: что работает, что не проверено, что заглушка.
Сообщения коммитов — по-русски, суть «зачем».

## 12. Определение готовности плагина

1. `typecheck` чист. 2. Production-сборка образа проходит (`docker build`), все новые маршруты в списке.
3. Миграция применяется на чистой БД (это проверяет CI) и на существующей без потери данных.
4. Живой прогон: без сессии 401/307; без права 403; с выключенным плагином API 403 и страница редиректит;
   включение возвращает работу; чужой `programId`/id из другой программы отклоняется.
5. Все три состояния экрана, светлая и тёмная темы. 6. Запись в `docs/08-decisions.md`, каталог витрины,
   `systemContext.ts`. 7. Проверено на сервере, а не только локально. Автотестов в репозитории пока нет
   (CI: typecheck + миграции + сборка + уведомление в Telegram) — проверки §12.4 делаются руками/скриптами.

## 13. Чего платформа НЕ умеет (не обещать в плагине, не изобретать заново молча)

Нет: динамической загрузки плагинов; очередей; фоновых задач вне расписания (расписание есть только в режиме шины, см. ниже); вебхуков и исходящих интеграций;
исполняемых действий в процессах (блок этапа — только описание/чек-лист); email/push-напоминаний;
файлового типа поля сущности (вложения — отдельный механизм); прямого URL записи сущности (правка идёт в
панели списка); календаря, почты/мессенджеров внутри системы, импорта данных, мобильного приложения;
нескольких программ в одном экземпляре (один экземпляр = одна программа); детальных прав на отдельную
сущность (одно право `entities.manage`); сводных отчётов (только распределение по одному полю);
автотестов. Если задача требует чего-то из списка — сказать об этом прямо и предложить обходной путь
или расширение ядра как отдельное решение.
