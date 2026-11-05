import DriverInterface from '../../Driver/DriverInterface';

export interface CountedRowsInterface {
  /** null - not counted and not estimated */
  total: number | null;
  /** by plan of database, exact count took too long */
  estimated: boolean;
}

/** counted rows are trusted this long - changes of other clients are not seen */
const TTL_MS = 60 * 1000;
/** queries remembered per connection */
const MAX_ENTRIES = 500;

/**
 * Rows of grid queries by connection - paging and sorting do not change the count query, so the table is not counted again.
 * Changes made through Flase clear the connection, Refresh in grid counts again.
 * @author Mateusz Bochen
 */
class CountCache {
  private static readonly counts = new WeakMap<DriverInterface, Map<string, CountedRowsInterface & {at: number}>>();
  /** counts in progress - next pages wait for them, they do not count again on other connections of the pool */
  private static readonly counting = new WeakMap<DriverInterface, Map<string, Promise<CountedRowsInterface>>>();

  static get(driver: DriverInterface, database: string | null, countQuery: string): CountedRowsInterface | undefined {
    const entries = CountCache.counts.get(driver);
    const key = CountCache.key(database, countQuery);
    const entry = entries?.get(key);
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.at > TTL_MS) {
      entries!.delete(key);
      return undefined;
    }
    return {total: entry.total, estimated: entry.estimated};
  }

  static set(driver: DriverInterface, database: string | null, countQuery: string, counted: CountedRowsInterface): void {
    let entries = CountCache.counts.get(driver);
    if (!entries) {
      entries = new Map();
      CountCache.counts.set(driver, entries);
    }
    const key = CountCache.key(database, countQuery);
    // re-inserted key goes to the end - the first one is the oldest
    entries.delete(key);
    entries.set(key, {...counted, at: Date.now()});
    if (entries.size > MAX_ENTRIES) {
      entries.delete(entries.keys().next().value!);
    }
  }

  static running(driver: DriverInterface, database: string | null, countQuery: string): Promise<CountedRowsInterface> | undefined {
    return CountCache.counting.get(driver)?.get(CountCache.key(database, countQuery));
  }

  /** count in progress, remembered when it ends */
  static track(driver: DriverInterface, database: string | null, countQuery: string, count: Promise<CountedRowsInterface>): Promise<CountedRowsInterface> {
    let running = CountCache.counting.get(driver);
    if (!running) {
      running = new Map();
      CountCache.counting.set(driver, running);
    }
    const key = CountCache.key(database, countQuery);
    running.set(key, count);
    return count
      .then((counted) => {
        // data changed while counting (clear) - count is not remembered
        if (CountCache.counting.get(driver) === running) CountCache.set(driver, database, countQuery, counted);
        return counted;
      })
      .finally(() => running!.get(key) === count && running!.delete(key));
  }

  /** data of connection may have changed */
  static clear(driver: DriverInterface): void {
    CountCache.counts.delete(driver);
    CountCache.counting.delete(driver);
  }

  private static key(database: string | null, countQuery: string): string {
    return `${database ?? ''}\n${countQuery}`;
  }
}

export default CountCache;
