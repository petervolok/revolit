/**
 * Начальный каталог шаблонов сущностей (Р-29) — самые частые разделы данных
 * в CRM. Сеется в базу один раз при первом обращении (см. presetService.ts) —
 * дальше это обычные строки в базе, которые можно править и удалять.
 *
 * Поле-связь в шаблоне ссылается на ДРУГОЙ ШАБЛОН по ключу (targetPresetKey),
 * а не на конкретную сущность — на этапе описания шаблона сущности ещё нет.
 */
import type { PresetFieldDef, PresetFieldOptions } from './types';

export interface PresetDef {
  key: string;
  name: string;
  namePlural: string;
  fields: PresetFieldDef[];
}

const STATUS = (choices: string[]): PresetFieldOptions => ({ choices });

export const DEFAULT_PRESETS: PresetDef[] = [
  {
    key: 'kontragent',
    name: 'Контрагент',
    namePlural: 'Контрагенты',
    fields: [
      { key: 'tip', label: 'Тип', type: 'select', required: true, options: STATUS(['Юридическое лицо', 'Физическое лицо', 'ИП']) },
      { key: 'naimenovanie', label: 'Наименование', type: 'text', required: true },
      { key: 'kratkoe-imya', label: 'Краткое имя', type: 'text', required: false },
      { key: 'inn', label: 'ИНН', type: 'text', required: false },
      { key: 'kpp', label: 'КПП', type: 'text', required: false },
      { key: 'ogrn', label: 'ОГРН', type: 'text', required: false },
      { key: 'yuridicheskiy-adres', label: 'Юридический адрес', type: 'text', required: false },
      { key: 'fakticheskiy-adres', label: 'Фактический адрес', type: 'text', required: false },
      { key: 'bankovskie-rekvizity', label: 'Банковские реквизиты', type: 'text', required: false },
      { key: 'telefon', label: 'Телефон', type: 'text', required: false },
      { key: 'pochta', label: 'Почта', type: 'text', required: false },
      { key: 'otvetstvennyy-menedzher', label: 'Ответственный менеджер', type: 'user', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Активный', 'Приостановлен', 'В архиве']) },
      { key: 'tegi', label: 'Теги', type: 'multiselect', required: false, options: STATUS(['VIP', 'Новый', 'Постоянный', 'Проблемный']) },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'kontaktnoe-litso',
    name: 'Контактное лицо',
    namePlural: 'Контактные лица',
    fields: [
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: true, options: { targetPresetKey: 'kontragent' } },
      { key: 'imya', label: 'Имя', type: 'text', required: true },
      { key: 'dolzhnost', label: 'Должность', type: 'text', required: false },
      { key: 'telefon', label: 'Телефон', type: 'text', required: false },
      { key: 'pochta', label: 'Почта', type: 'text', required: false },
    ],
  },
  {
    key: 'klient',
    name: 'Клиент',
    namePlural: 'Клиенты',
    fields: [
      { key: 'fio', label: 'ФИО', type: 'text', required: true },
      { key: 'telefon', label: 'Телефон', type: 'text', required: false },
      { key: 'pochta', label: 'Почта', type: 'text', required: false },
      { key: 'istochnik', label: 'Источник', type: 'select', required: false, options: STATUS(['Реклама', 'Сарафанное радио', 'Сайт', 'Соцсети', 'Другое']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Новый', 'В работе', 'Постоянный', 'Потерян']) },
      { key: 'data-rozhdeniya', label: 'Дата рождения', type: 'date', required: false },
      { key: 'otvetstvennyy-menedzher', label: 'Ответственный менеджер', type: 'user', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'proekt',
    name: 'Проект',
    namePlural: 'Проекты',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'kontragent', label: 'Заказчик', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'menedzher', label: 'Менеджер', type: 'user', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Планирование', 'В работе', 'На паузе', 'Завершён']) },
      { key: 'prioritet', label: 'Приоритет', type: 'select', required: false, options: STATUS(['Низкий', 'Обычный', 'Высокий', 'Срочный']) },
      { key: 'data-nachala', label: 'Дата начала', type: 'date', required: false },
      { key: 'data-okonchaniya', label: 'Дата окончания (план)', type: 'date', required: false },
      { key: 'byudzhet', label: 'Бюджет', type: 'number', required: false },
      { key: 'opisanie', label: 'Описание', type: 'text', required: false },
    ],
  },
  {
    key: 'zakaz',
    name: 'Заказ',
    namePlural: 'Заказы',
    fields: [
      { key: 'nomer', label: 'Номер', type: 'text', required: true },
      { key: 'kontragent', label: 'Клиент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'menedzher', label: 'Менеджер', type: 'user', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Новый', 'В обработке', 'Выполнен', 'Отменён']) },
      { key: 'summa', label: 'Сумма', type: 'number', required: false },
      { key: 'data-zakaza', label: 'Дата заказа', type: 'date', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'zvonok',
    name: 'Звонок',
    namePlural: 'Звонки',
    fields: [
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'napravlenie', label: 'Направление', type: 'select', required: true, options: STATUS(['Входящий', 'Исходящий']) },
      { key: 'data-i-vremya', label: 'Дата и время', type: 'date', required: true },
      { key: 'dlitelnost-minut', label: 'Длительность, мин', type: 'number', required: false },
      { key: 'rezultat', label: 'Результат', type: 'select', required: false, options: STATUS(['Договорились', 'Не дозвонились', 'Перезвонить позже', 'Отказ']) },
      { key: 'otvetstvennyy', label: 'Ответственный', type: 'user', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'schet',
    name: 'Счёт',
    namePlural: 'Счета',
    fields: [
      { key: 'nomer', label: 'Номер', type: 'text', required: true },
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'summa', label: 'Сумма', type: 'number', required: true },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Выставлен', 'Оплачен', 'Просрочен', 'Отменён']) },
      { key: 'data-vystavleniya', label: 'Дата выставления', type: 'date', required: false },
      { key: 'data-oplaty', label: 'Дата оплаты', type: 'date', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'rabota',
    name: 'Работа',
    namePlural: 'Работы',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'proekt', label: 'Проект', type: 'relation', required: false, options: { targetPresetKey: 'proekt' } },
      { key: 'ispolnitel', label: 'Исполнитель', type: 'user', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Не начата', 'В работе', 'На проверке', 'Готова']) },
      { key: 'srok', label: 'Срок', type: 'date', required: false },
      { key: 'opisanie', label: 'Описание', type: 'text', required: false },
    ],
  },
  {
    key: 'banket',
    name: 'Банкет',
    namePlural: 'Банкеты',
    fields: [
      { key: 'data', label: 'Дата', type: 'date', required: true },
      { key: 'zal', label: 'Зал', type: 'text', required: false },
      { key: 'kontragent', label: 'Клиент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'kolichestvo-gostey', label: 'Количество гостей', type: 'number', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Предварительно', 'Подтверждён', 'Проведён', 'Отменён']) },
      { key: 'menedzher', label: 'Менеджер', type: 'user', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'blyudo',
    name: 'Блюдо',
    namePlural: 'Блюда',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'kategoriya', label: 'Категория', type: 'select', required: false, options: STATUS(['Закуска', 'Горячее', 'Десерт', 'Напиток']) },
      { key: 'tsena', label: 'Цена', type: 'number', required: false },
      { key: 'sostav', label: 'Состав', type: 'text', required: false },
      { key: 'dostupno', label: 'Доступно', type: 'select', required: false, options: STATUS(['Да', 'Нет']) },
    ],
  },
  {
    key: 'otchet',
    name: 'Отчёт',
    namePlural: 'Отчёты',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'period', label: 'Период', type: 'text', required: false },
      { key: 'avtor', label: 'Автор', type: 'user', required: false },
      { key: 'data-sozdaniya', label: 'Дата создания', type: 'date', required: false },
      { key: 'soderzhanie', label: 'Содержание', type: 'text', required: false },
    ],
  },
  {
    key: 'zayavka',
    name: 'Заявка',
    namePlural: 'Заявки',
    fields: [
      { key: 'istochnik', label: 'Источник', type: 'select', required: false, options: STATUS(['Сайт', 'Телефон', 'Почта', 'Другое']) },
      { key: 'imya', label: 'Имя', type: 'text', required: true },
      { key: 'telefon', label: 'Телефон', type: 'text', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Новая', 'В работе', 'Обработана', 'Отклонена']) },
      { key: 'otvetstvennyy', label: 'Ответственный', type: 'user', required: false },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'zadacha',
    name: 'Задача',
    namePlural: 'Задачи',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'ispolnitel', label: 'Исполнитель', type: 'user', required: false },
      { key: 'srok', label: 'Срок', type: 'date', required: false },
      { key: 'prioritet', label: 'Приоритет', type: 'select', required: false, options: STATUS(['Низкий', 'Обычный', 'Высокий', 'Срочный']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Не начата', 'В работе', 'На проверке', 'Готова']) },
      { key: 'opisanie', label: 'Описание', type: 'text', required: false },
    ],
  },
  {
    key: 'vstrecha',
    name: 'Встреча',
    namePlural: 'Встречи',
    fields: [
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'data-i-vremya', label: 'Дата и время', type: 'date', required: true },
      { key: 'mesto', label: 'Место', type: 'text', required: false },
      { key: 'uchastniki', label: 'Участники', type: 'text', required: false },
      { key: 'rezultat', label: 'Результат', type: 'select', required: false, options: STATUS(['Состоялась', 'Перенесена', 'Отменена']) },
      { key: 'otvetstvennyy', label: 'Ответственный', type: 'user', required: false },
    ],
  },
  {
    key: 'dogovor',
    name: 'Договор',
    namePlural: 'Договоры',
    fields: [
      { key: 'nomer', label: 'Номер', type: 'text', required: true },
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'summa', label: 'Сумма', type: 'number', required: false },
      { key: 'data-podpisaniya', label: 'Дата подписания', type: 'date', required: false },
      { key: 'data-okonchaniya', label: 'Дата окончания', type: 'date', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Действует', 'Истекает', 'Завершён', 'Расторгнут']) },
      { key: 'kommentarii', label: 'Комментарии', type: 'text', required: false },
    ],
  },
  {
    key: 'tovar',
    name: 'Товар или услуга',
    namePlural: 'Товары и услуги',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'kategoriya', label: 'Категория', type: 'text', required: false },
      { key: 'tsena', label: 'Цена', type: 'number', required: false },
      { key: 'edinitsa-izmereniya', label: 'Единица измерения', type: 'text', required: false },
      { key: 'v-nalichii', label: 'В наличии', type: 'select', required: false, options: STATUS(['Да', 'Нет', 'Под заказ']) },
      { key: 'opisanie', label: 'Описание', type: 'text', required: false },
    ],
  },
  {
    key: 'platezh',
    name: 'Платёж',
    namePlural: 'Платежи',
    fields: [
      { key: 'schet', label: 'Счёт', type: 'relation', required: false, options: { targetPresetKey: 'schet' } },
      { key: 'summa', label: 'Сумма', type: 'number', required: true },
      { key: 'data', label: 'Дата', type: 'date', required: true },
      { key: 'sposob-oplaty', label: 'Способ оплаты', type: 'select', required: false, options: STATUS(['Наличные', 'Карта', 'Банковский перевод']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Проведён', 'Ожидается', 'Отменён']) },
    ],
  },
  {
    key: 'obrashchenie',
    name: 'Обращение в поддержку',
    namePlural: 'Обращения в поддержку',
    fields: [
      { key: 'tema', label: 'Тема', type: 'text', required: true },
      { key: 'kontragent', label: 'Контрагент', type: 'relation', required: false, options: { targetPresetKey: 'kontragent' } },
      { key: 'prioritet', label: 'Приоритет', type: 'select', required: false, options: STATUS(['Низкий', 'Обычный', 'Высокий', 'Критичный']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Новое', 'В работе', 'Ожидает ответа', 'Решено']) },
      { key: 'otvetstvennyy', label: 'Ответственный', type: 'user', required: false },
      { key: 'opisanie', label: 'Описание', type: 'text', required: false },
    ],
  },
  {
    key: 'kampaniya',
    name: 'Кампания',
    namePlural: 'Кампании',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'kanal', label: 'Канал', type: 'select', required: false, options: STATUS(['Реклама', 'Email-рассылка', 'Соцсети', 'Мероприятие', 'Другое']) },
      { key: 'byudzhet', label: 'Бюджет', type: 'number', required: false },
      { key: 'data-nachala', label: 'Дата начала', type: 'date', required: false },
      { key: 'data-okonchaniya', label: 'Дата окончания', type: 'date', required: false },
      { key: 'otvetstvennyy', label: 'Ответственный', type: 'user', required: false },
      { key: 'rezultat', label: 'Результат', type: 'text', required: false },
    ],
  },

  // ─── Для будущего продукта CMS (шаг 13) ───
  // Типы контента сайта — тот же механизм сущностей, что и CRM-разделы выше
  // (обоснование — см. «Механизм сущностей» в дорожной карте). Работают уже
  // сейчас, внутри CRM, и не требуют отдельного продукта, чтобы быть полезными.
  // Медиатека сюда не включена — нужно подключённое хранение файлов (Р-21).
  {
    key: 'stranitsa',
    name: 'Страница',
    namePlural: 'Страницы',
    fields: [
      { key: 'zagolovok', label: 'Заголовок', type: 'text', required: true },
      { key: 'adres', label: 'Адрес страницы (URL)', type: 'text', required: true },
      { key: 'soderzhanie', label: 'Содержание', type: 'text', required: false },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Черновик', 'Опубликована', 'Скрыта']) },
      { key: 'seo-zagolovok', label: 'SEO-заголовок', type: 'text', required: false },
      { key: 'seo-opisanie', label: 'SEO-описание', type: 'text', required: false },
      { key: 'avtor', label: 'Автор', type: 'user', required: false },
      { key: 'data-publikatsii', label: 'Дата публикации', type: 'date', required: false },
    ],
  },
  {
    key: 'statya',
    name: 'Статья',
    namePlural: 'Статьи',
    fields: [
      { key: 'zagolovok', label: 'Заголовок', type: 'text', required: true },
      { key: 'adres', label: 'Адрес страницы (URL)', type: 'text', required: true },
      { key: 'anons', label: 'Анонс', type: 'text', required: false },
      { key: 'soderzhanie', label: 'Содержание', type: 'text', required: false },
      { key: 'kategoriya', label: 'Категория', type: 'text', required: false },
      { key: 'tegi', label: 'Теги', type: 'multiselect', required: false, options: STATUS(['Новости', 'Советы', 'Кейсы', 'Обновления']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['Черновик', 'Опубликована', 'Скрыта']) },
      { key: 'avtor', label: 'Автор', type: 'user', required: false },
      { key: 'data-publikatsii', label: 'Дата публикации', type: 'date', required: false },
    ],
  },
  {
    key: 'punkt-menyu',
    name: 'Пункт меню',
    namePlural: 'Пункты меню',
    fields: [
      { key: 'nazvanie', label: 'Название', type: 'text', required: true },
      { key: 'ssylka', label: 'Ссылка', type: 'text', required: false },
      // Связь на тот же шаблон — вложенность меню. Родитель находится тем же
      // приёмом, что и любая другая связь: по ключу шаблона-источника (Р-29).
      { key: 'roditelskiy-punkt', label: 'Родительский пункт', type: 'relation', required: false, options: { targetPresetKey: 'punkt-menyu' } },
      { key: 'poryadok', label: 'Порядок', type: 'number', required: false },
      { key: 'aktiven', label: 'Активен', type: 'select', required: false, options: STATUS(['Да', 'Нет']) },
    ],
  },
  {
    key: 'vopros-otvet',
    name: 'Вопрос и ответ',
    namePlural: 'Вопросы и ответы',
    fields: [
      { key: 'vopros', label: 'Вопрос', type: 'text', required: true },
      { key: 'otvet', label: 'Ответ', type: 'text', required: true },
      { key: 'kategoriya', label: 'Категория', type: 'text', required: false },
      { key: 'poryadok', label: 'Порядок', type: 'number', required: false },
    ],
  },
  {
    key: 'otzyv',
    name: 'Отзыв',
    namePlural: 'Отзывы',
    fields: [
      { key: 'imya', label: 'Имя', type: 'text', required: true },
      { key: 'kompaniya', label: 'Компания', type: 'text', required: false },
      { key: 'tekst', label: 'Текст отзыва', type: 'text', required: true },
      { key: 'otsenka', label: 'Оценка', type: 'select', required: false, options: STATUS(['1', '2', '3', '4', '5']) },
      { key: 'status', label: 'Статус', type: 'select', required: true, options: STATUS(['На проверке', 'Опубликован', 'Скрыт']) },
      { key: 'data', label: 'Дата', type: 'date', required: false },
    ],
  },
];
