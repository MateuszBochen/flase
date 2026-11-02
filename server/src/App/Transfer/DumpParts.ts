import {DumpOptionsInterface, DumpProgressInterface} from '../Driver/Interface/Data/TransferInterface';

export type DumpPartsType = {structure: boolean, data: boolean};

/** state of dump without transferred bytes - those are counted by the download */
export type DumpProgressType = Omit<DumpProgressInterface, 'tabId' | 'bytes'>;
export type DumpProgressCallbackType = (progress: DumpProgressType) => void;

/** what is dumped of table / view - own mode of the table or structure / data of whole dump */
export const dumpPartsOf = (options: DumpOptionsInterface, table: string): DumpPartsType => {
  // own keys only - table named constructor / toString must not get a method of Object as its mode
  const mode = options.tableModes && Object.prototype.hasOwnProperty.call(options.tableModes, table) ? options.tableModes[table] : undefined;
  return mode
    ? {structure: mode !== 'data', data: mode !== 'structure'}
    : {structure: options.structure, data: options.data};
};

/** dump writes something - at least one table has structure or data */
export const dumpHasContent = (options: DumpOptionsInterface): boolean => options.structure || options.data
  || Object.values(options.tableModes || {}).some((mode) => ['both', 'structure', 'data'].includes(mode));
