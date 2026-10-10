
/** row of SHOW FULL PROCESSLIST */
interface ProcessInterface {
  id: number;
  user: string;
  host: string;
  db: string | null;
  command: string;
  /** seconds */
  time: number;
  state: string | null;
  info: string | null;
  /** connection of this application (its own pool) */
  own: boolean;
}

export default ProcessInterface;
