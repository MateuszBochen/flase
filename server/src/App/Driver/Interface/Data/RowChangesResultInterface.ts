
/** answer for preview (dryRun) and for applied changes */
interface RowChangesResultInterface {
  tabId?: string;
  statements: string[];
  affectedRows: number;
}

export default RowChangesResultInterface;
