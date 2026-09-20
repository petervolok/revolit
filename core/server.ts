/**
 * Опубликованный интерфейс ядра — серверная часть.
 *
 * Всё, что обращается к кукам, базе данных, почте и файловой системе.
 * Обращаться к этому входу можно только из серверного кода: страниц без
 * пометки 'use client', обработчиков запросов и задач.
 *
 * Браузерная часть — в '@revolit/core'.
 */

// Доступ
export { getCurrentUser, hasPermission, createSession, destroySession } from './auth/session';
export type { CurrentUser } from './auth/types';
export { requirePermission, isDenied } from './auth/guard';
export { requirePageAccess } from './auth/page-guard';

// Данные
export { prisma } from './data/prisma';
export { getCurrentProgram } from './data/program';

// Сменные части: подключение и отправка
export { setMailPort, getMailPort, setStoragePort, getStoragePort } from './ports/registry';
export { sendMail } from './ports/mail';

// Сущности
export {
  EntityError,
  listTemplates,
  getTemplate,
  createTemplate,
  renameTemplate,
  deleteTemplate,
  addField,
  updateField,
  removeField,
  reorderFields,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
} from './entities/service';

// Конструктор процессов
export {
  ProcessError,
  listTemplates as listProcessTemplates,
  getTemplate as getProcessTemplate,
  createTemplate as createProcessTemplate,
  renameTemplate as renameProcessTemplate,
  deleteTemplate as deleteProcessTemplate,
  addStage,
  updateStage,
  removeStage,
  reorderStages,
  listInstances,
  createInstance,
  getInstance,
  moveInstance,
  setInstanceStatus,
  toggleChecklistItem,
  deleteInstance,
  listInstancesForRecord,
} from './processes/service';

// Лицензия
export { getLicenseStatus, activateLicense, deactivateLicense, hasFeature, LicenseError } from './licensing/service';

// Витрина плагинов — включение/выключение уже установленных модулей (Р-34)
export {
  listDisabledModuleKeys,
  isModuleEnabled,
  assertModuleEnabled,
  setModuleEnabled,
  ModuleToggleError,
} from './modules/toggles';

// ИИ-консультант
export {
  listAiGroups,
  createAiGroup,
  renameAiGroup,
  deleteAiGroup,
  setActiveAiGroup,
  addAiKey,
  removeAiKey,
  consult,
  AiError,
} from './ai/service';

// Отчёты
export { listReportableTemplates, getFieldReport, ReportError } from './reports/service';

// Задачи
export { listTasks, createTask, updateTask, setTaskStatus, deleteTask, TaskError } from './tasks/service';

// Сводка главного экрана
export { getDashboardSummary } from './dashboard/service';

// Расписание
export { listJobs, upsertJob, ensureJob, deleteJob, SchedulerError } from './scheduler/service';
export type { ScheduledJobDef } from './scheduler/service';

// Вложения
export { listAttachments, uploadAttachment, getAttachmentFile, deleteAttachment, AttachmentError } from './attachments/service';
export type { AttachmentParent } from './attachments/service';

// Каталог шаблонов сущностей
export {
  PresetError,
  listPresets,
  getPreset,
  createPreset,
  updatePreset,
  deletePreset,
  materializePreset,
} from './entities/presetService';
