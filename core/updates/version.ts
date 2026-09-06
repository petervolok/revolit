import pkg from '../../package.json';

/** Версия программы — из корневого package.json, чтобы не дублировать число вручную */
export const APP_VERSION: string = pkg.version;
