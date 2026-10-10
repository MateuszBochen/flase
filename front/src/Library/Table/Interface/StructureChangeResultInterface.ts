
/** answer for preview (dryRun) and for executed structure change */
interface StructureChangeResultInterface {
  tabId?: string;
  /** kind of change, client decides what to reload */
  kind: string;
  statements: string[];
}

export default StructureChangeResultInterface;
