import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType, SingleRowType} from '../Interface/RecordsViewPropsInterface';
import SqlLiteral from '../../../Library/Database/Driver/Adapter/MySql/SqlLiteral';
import SqlLiteralInterface from '../../../Library/Database/Driver/SqlLiteralInterface';
import {isBinaryValue} from '../../../Library/Record/BinaryValue';

export type CopyFormatType = 'tsv' | 'tsv-header' | 'csv' | 'markdown' | 'insert' | 'json' | 'xml' | 'html' | 'latex';

export const COPY_FORMATS: {format: CopyFormatType, label: string}[] = [
  {format: 'tsv', label: 'TSV'},
  {format: 'tsv-header', label: 'TSV with header'},
  {format: 'csv', label: 'CSV'},
  {format: 'markdown', label: 'Markdown'},
  {format: 'insert', label: 'SQL INSERT'},
  {format: 'json', label: 'JSON'},
  {format: 'xml', label: 'XML'},
  {format: 'html', label: 'HTML table'},
  {format: 'latex', label: 'LaTeX'},
];

/** file name extension and mime type of export */
export const EXPORT_FILE: {[format in CopyFormatType]: {extension: string, mimeType: string}} = {
  'tsv': {extension: 'tsv', mimeType: 'text/tab-separated-values'},
  'tsv-header': {extension: 'tsv', mimeType: 'text/tab-separated-values'},
  'csv': {extension: 'csv', mimeType: 'text/csv'},
  'markdown': {extension: 'md', mimeType: 'text/markdown'},
  'insert': {extension: 'sql', mimeType: 'application/sql'},
  'json': {extension: 'json', mimeType: 'application/json'},
  'xml': {extension: 'xml', mimeType: 'application/xml'},
  'html': {extension: 'html', mimeType: 'text/html'},
  'latex': {extension: 'tex', mimeType: 'application/x-tex'},
};

/** binary values come from server as preview, they are copied as text when possible */
const plain = (value: CellValueType | undefined | object): CellValueType => {
  if (isBinaryValue(value)) {
    return value.text !== null ? value.text : `[BLOB ${value.size} B]`;
  }
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value === undefined ? null : value;
};

const tsvCell = (value: CellValueType): string => value === null ? 'NULL' : String(value).replace(/[\t\n\r]/g, ' ');

/** NULL is empty field, empty string is "" - so they can be told apart */
const csvCell = (value: CellValueType): string => {
  if (value === null) return '';
  const text = String(value);
  return text === '' || /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** characters not allowed in XML 1.0 are left out */
export const xmlText = (value: string): string => value
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const latexCell = (value: CellValueType): string => {
  if (value === null) return '\\textit{NULL}';
  const special: {[char: string]: string} = {'\\': '\\textbackslash{}', '~': '\\textasciitilde{}', '^': '\\textasciicircum{}', '\n': ' ', '\r': ''};
  // one pass - replacement of backslash must not be escaped again
  return String(value).replace(/[\\~^\n\r&%$#_{}]/g, (char) => special[char] ?? `\\${char}`);
};

const markdownCell = (value: CellValueType): string => {
  if (value === null) return '*NULL*';
  if (value === '') return "''";
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
};

/**
 * copy of selected rows and columns.
 * table - name used for INSERT (table of editable result or of first column)
 */
/** sql - quoting of INSERT format, MySQL when not given */
export const formatCopy = (format: CopyFormatType, columns: ColumnInterface[], rows: SingleRowType[], table?: string, sql: SqlLiteralInterface = new SqlLiteral()): string => {
  const values = rows.map((row) => columns.map((column) => plain(row[column.key])));
  const names = columns.map((column) => column.name);

  switch (format) {
    case 'tsv':
      return values.map((row) => row.map(tsvCell).join('\t')).join('\n');
    case 'tsv-header':
      return [names.join('\t'), ...values.map((row) => row.map(tsvCell).join('\t'))].join('\n');
    case 'csv':
      return [names.map(csvCell).join(','), ...values.map((row) => row.map(csvCell).join(','))].join('\n');
    case 'markdown':
      return [
        `| ${names.map(markdownCell).join(' | ')} |`,
        `| ${names.map(() => '---').join(' | ')} |`,
        ...values.map((row) => `| ${row.map(markdownCell).join(' | ')} |`),
      ].join('\n');
    case 'insert': {
      const tableName = sql.identifier(table || columns.find((column) => column.table?.name)?.table.name || 'table');
      const columnList = columns.map((column) => sql.identifier(column.orgName || column.name)).join(', ');
      return `INSERT INTO ${tableName} (${columnList}) VALUES\n${values.map((row) => `  (${row.map((value) => sql.value(value)).join(', ')})`).join(',\n')};`;
    }
    case 'json':
      // key is unique also when name repeats (JOIN)
      return JSON.stringify(values.map((row) => Object.fromEntries(columns.map((column, index) => [column.key, row[index]]))), null, 2);
    case 'xml':
      // format of mysqldump --xml - NULL is xsi:nil
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<resultset name="${xmlText(table || columns.find((column) => column.table?.name)?.table.name || 'result')}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
        ...values.map((row) => [
          '  <row>',
          ...row.map((value, index) => value === null
            ? `    <field name="${xmlText(names[index])}" xsi:nil="true" />`
            : `    <field name="${xmlText(names[index])}">${xmlText(String(value))}</field>`),
          '  </row>',
        ].join('\n')),
        '</resultset>',
      ].join('\n');
    case 'html':
      return [
        '<table>',
        `  <thead><tr>${names.map((name) => `<th>${xmlText(name)}</th>`).join('')}</tr></thead>`,
        '  <tbody>',
        ...values.map((row) => `    <tr>${row.map((value) => value === null ? '<td class="null">NULL</td>' : `<td>${xmlText(String(value))}</td>`).join('')}</tr>`),
        '  </tbody>',
        '</table>',
      ].join('\n');
    case 'latex':
      return [
        `\\begin{longtable}{|${names.map(() => 'l').join('|')}|}`,
        '\\hline',
        `${names.map((name) => `\\textbf{${latexCell(name)}}`).join(' & ')} \\\\ \\hline`,
        '\\endhead',
        ...values.map((row) => `${row.map(latexCell).join(' & ')} \\\\ \\hline`),
        '\\end{longtable}',
      ].join('\n');
  }
};
