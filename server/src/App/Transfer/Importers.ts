import {Readable} from 'stream';
import {StringDecoder} from 'string_decoder';
import DriverInterface from '../Driver/DriverInterface';
import DriverSessionInterface from '../Driver/DriverSessionInterface';
import StreamingSqlSplitter from './StreamingSqlSplitter';
import CsvParser from './CsvParser';
import {CsvImportOptionsInterface, ImportFinishedInterface, ImportProgressInterface} from '../Driver/Interface/Data/TransferInterface';
import AbstractCommandHandler from '../Websocket/CommandHandler/AbstractCommandHandler';

const PROGRESS_INTERVAL_MS = 300;
const CSV_BATCH_ROWS = 500;
const MAX_REPORTED_ERRORS = 20;

type ProgressCallback = (progress: ImportProgressInterface) => void;

/** common state of import - bytes read, statements, errors, progress messages */
class ImportState {
  readonly started = Date.now();
  bytes = 0;
  statements = 0;
  rows = 0;
  errors: {statement: string, error: string}[] = [];
  private lastProgress = 0;

  constructor(private readonly onProgress: ProgressCallback) {
  }

  addError(statement: string, error: any): void {
    if (this.errors.length < MAX_REPORTED_ERRORS) {
      this.errors.push({statement: statement.length > 300 ? `${statement.slice(0, 300)}…` : statement, error: AbstractCommandHandler.errorToString(error)});
    }
  }

  progress(force: boolean = false): void {
    if (force || Date.now() - this.lastProgress >= PROGRESS_INTERVAL_MS) {
      this.lastProgress = Date.now();
      this.onProgress(this.snapshot());
    }
  }

  snapshot(): ImportProgressInterface {
    return {bytes: this.bytes, statements: this.statements, rows: this.rows, errors: [...this.errors]};
  }

  finished(cancelled: boolean, failed: boolean): ImportFinishedInterface {
    return {...this.snapshot(), cancelled, failed, durationMs: Date.now() - this.started};
  }
}

/** text chunks of stream, multi byte characters are not broken between chunks */
async function* textChunks(input: Readable, state: ImportState): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  for await (const chunk of input) {
    state.bytes += chunk.length;
    yield decoder.write(chunk);
  }
  yield decoder.end();
}

/**
 * SQL file - statements are executed one by one while the file is uploaded
 */
export const importSql = async (
  driver: DriverInterface,
  database: string | null,
  tabId: string,
  stopOnError: boolean,
  input: Readable,
  onProgress: ProgressCallback,
): Promise<ImportFinishedInterface> => {
  const state = new ImportState(onProgress);
  const session: DriverSessionInterface = await driver.openSession(database, tabId);
  const splitter = new StreamingSqlSplitter(driver.dialect);
  let failed = false;

  const run = async (statements: string[]): Promise<boolean> => {
    for (const statement of statements) {
      if (session.isCancelled()) return false;
      try {
        await session.execute(statement, () => undefined, () => undefined, 0);
        state.statements++;
      } catch (e) {
        state.addError(statement, e);
        if (session.isCancelled()) return false;
        if (stopOnError) {
          failed = true;
          return false;
        }
      }
      state.progress();
    }
    return true;
  };

  try {
    let goOn = true;
    for await (const text of textChunks(input, state)) {
      if (!(goOn = await run(splitter.push(text)))) break;
    }
    if (goOn) {
      await run(splitter.end());
    }
  } finally {
    session.release();
  }
  // rest of upload is not needed anymore
  input.resume();
  return state.finished(session.isCancelled(), failed);
};

/**
 * CSV file into existing table, in one transaction - error rolls back everything
 */
export const importCsv = async (
  driver: DriverInterface,
  options: CsvImportOptionsInterface,
  tabId: string,
  input: Readable,
  onProgress: ProgressCallback,
): Promise<ImportFinishedInterface> => {
  const state = new ImportState(onProgress);
  const mapped = options.columns
    .map((column, index) => ({column, index}))
    .filter((item): item is {column: string, index: number} => !!item.column);
  if (!mapped.length) {
    throw new Error('Select at least one target column');
  }
  const columns = mapped.map((item) => item.column);
  const parser = new CsvParser(options.delimiter || ',');
  const session = await driver.openSession(options.database, tabId);
  let failed = false;
  let csvRow = 0;
  let batch: (string | null)[][] = [];
  let batchStartRow = 0;

  const toValue = (value: string | undefined, quoted: boolean): string | null => {
    if (value === undefined) return null;
    if (quoted) return value;
    if (options.nullValue === 'empty' && value === '') return null;
    if (options.nullValue === '\\N' && value === '\\N') return null;
    if (options.nullValue === 'NULL' && value.toUpperCase() === 'NULL') return null;
    return value;
  };

  const flush = async () => {
    if (!batch.length) return;
    const statement = driver.buildInsertStatement(options.database, options.table, columns, batch);
    try {
      await session.execute(statement, () => undefined, () => undefined, 0);
      state.rows += batch.length;
      state.statements++;
      batch = [];
      state.progress();
    } catch (e) {
      state.addError(`CSV rows ${batchStartRow}-${batchStartRow + batch.length - 1}`, e);
      throw e;
    }
  };

  try {
    if (options.truncate) {
      // TRUNCATE commits by itself - it cannot be part of the transaction
      const [truncate] = await driver.buildStructureChangeStatements({databaseName: options.database, name: options.table}, {kind: 'truncate'});
      await session.execute(truncate, () => undefined, () => undefined, 0);
    }
    await session.execute('START TRANSACTION', () => undefined, () => undefined, 0);

    const consume = async (rows: {values: string[], quoted: boolean[]}[]) => {
      for (const row of rows) {
        csvRow++;
        if (options.header && csvRow === 1) continue;
        if (session.isCancelled()) throw new Error('Import was cancelled');
        if (!batch.length) batchStartRow = csvRow;
        batch.push(mapped.map((item) => toValue(row.values[item.index], !!row.quoted[item.index])));
        if (batch.length >= CSV_BATCH_ROWS) {
          await flush();
        }
      }
    };

    for await (const text of textChunks(input, state)) {
      await consume(parser.push(text));
    }
    await consume(parser.end());
    await flush();
    await session.execute('COMMIT', () => undefined, () => undefined, 0);
  } catch (e) {
    failed = true;
    if (!state.errors.length) {
      state.addError(`CSV row ${csvRow}`, e);
    }
    await session.execute('ROLLBACK', () => undefined, () => undefined, 0).catch(() => undefined);
    // nothing was saved
    state.rows = 0;
    input.resume();
  } finally {
    session.release();
  }
  return state.finished(session.isCancelled(), failed);
};
