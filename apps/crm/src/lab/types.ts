/* eslint-disable @typescript-eslint/no-explicit-any */

/** Узел дерева конфигурации: какой кубик, с какими параметрами, что лежит в его слотах. */
export interface CubeNode {
  cube: string;
  props?: Record<string, any>;
  slots?: Record<string, CubeNode[]>;
}

export interface Screen {
  key: string;
  name: string;
  layout: CubeNode[];
}

export interface Project {
  name: string;
  domain: string;
  screens: Screen[];
}

export type FieldType = 'text' | 'number' | 'percent' | 'currency' | 'select' | 'bool' | 'date' | 'password';

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  /** Вычисляемое поле: в форме редактирования не показывается */
  computed?: boolean;
}

export interface EntityDef {
  key: string;
  name: string;
  titleField: string;
  fields: FieldDef[];
}

export type Row = Record<string, any> & { id: string };
export type Data = Record<string, Row[]>;
