import type * as monaco from 'monaco-editor';

export type CompletionTableType = {name: string, columns: {name: string, type?: string}[]};

export type CompletionSourceType = {
  keywords: string[];
  tables: CompletionTableType[];
};

/** completion data of every editor, key is uri of its model */
const sources = new Map<string, () => CompletionSourceType>();
/** monaco instance used by editors (the one loaded by @monaco-editor/react) */
let api: typeof monaco | null = null;

const unquote = (name: string) => name.replace(/`/g, '');

/** alias / table name -> table name, from FROM and JOIN parts of query */
const tablesOfQuery = (text: string): Map<string, string> => {
  const aliases = new Map<string, string>();
  const keywords = /^(where|join|left|right|inner|outer|cross|on|using|group|order|limit|having|union|set|natural)$/i;
  const pattern = /\b(?:from|join|update|into)\s+((?:`[^`]+`|\w+)(?:\.(?:`[^`]+`|\w+))?)(?:\s+(?:as\s+)?(`[^`]+`|\w+))?/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const table = unquote(match[1].split('.').pop()!);
    aliases.set(table.toLowerCase(), table);
    if (match[2] && !keywords.test(unquote(match[2]))) {
      aliases.set(unquote(match[2]).toLowerCase(), table);
    }
  }
  return aliases;
};

const provideCompletionItems = (model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionList => {
  const source = sources.get(model.uri.toString());
  if (!source) {
    return {suggestions: []};
  }
  const {keywords, tables} = source();
  const word = model.getWordUntilPosition(position);
  const kind = api!.languages.CompletionItemKind;
  const range = {startLineNumber: position.lineNumber, startColumn: word.startColumn, endLineNumber: position.lineNumber, endColumn: word.endColumn};
  const textBefore = model.getValueInRange({startLineNumber: position.lineNumber, startColumn: 1, endLineNumber: position.lineNumber, endColumn: word.startColumn});
  const aliases = tablesOfQuery(model.getValue());
  const tableByName = new Map(tables.map((table) => [table.name.toLowerCase(), table]));

  const columnItems = (table: CompletionTableType, sortPrefix: string): monaco.languages.CompletionItem[] => table.columns.map((column) => ({
    label: {label: column.name, description: `${table.name}${column.type ? ` · ${column.type}` : ''}`},
    kind: kind.Field,
    insertText: /^\w+$/.test(column.name) ? column.name : `\`${column.name}\``,
    sortText: `${sortPrefix}${column.name}`,
    range,
  }));

  // alias. or table. -> only columns of that table
  const qualifier = /(`[^`]+`|\w+)\.$/.exec(textBefore);
  if (qualifier) {
    const tableName = aliases.get(unquote(qualifier[1]).toLowerCase()) || unquote(qualifier[1]);
    const table = tableByName.get(tableName.toLowerCase());
    return {suggestions: table ? columnItems(table, '0') : []};
  }

  const usedTables = Array.from(new Set(aliases.values()))
    .map((name) => tableByName.get(name.toLowerCase()))
    .filter((table): table is CompletionTableType => !!table);

  return {
    suggestions: [
      ...usedTables.flatMap((table) => columnItems(table, '1')),
      ...tables.map((table) => ({
        label: {label: table.name, description: 'table'},
        kind: kind.Struct,
        insertText: /^\w+$/.test(table.name) ? table.name : `\`${table.name}\``,
        sortText: `2${table.name}`,
        range,
      })),
      ...keywords.map((keyword) => ({
        label: keyword,
        kind: kind.Keyword,
        insertText: keyword,
        sortText: `3${keyword}`,
        range,
      })),
    ],
  };
};

/**
 * one provider for all sql editors - provider registered per editor would add suggestions of all tabs together
 */
export const registerSqlCompletion = (monacoInstance: typeof monaco, model: monaco.editor.ITextModel, source: () => CompletionSourceType): () => void => {
  if (!api) {
    api = monacoInstance;
    monacoInstance.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['.'],
      provideCompletionItems,
    });
  }
  const key = model.uri.toString();
  sources.set(key, source);
  return () => sources.delete(key);
};
