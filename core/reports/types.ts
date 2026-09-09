/** Описания отчётов — общие для сервера и браузера (Р-34) */

export interface ReportableTemplate {
  key: string;
  namePlural: string;
  /** Поля, по которым можно построить распределение — select/multiselect */
  groupableFields: { key: string; label: string }[];
  recordCount: number;
}

export interface ReportBucket {
  /** Подпись значения поля; «—» для пустых записей */
  label: string;
  count: number;
}

export interface FieldReport {
  templateKey: string;
  fieldKey: string;
  fieldLabel: string;
  total: number;
  buckets: ReportBucket[];
}
