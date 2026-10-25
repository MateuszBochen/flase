import ColumnInterface from '../Table/Interface/ColumnInterface';
import SqlLiteralInterface from '../Database/Driver/SqlLiteralInterface';
import {CellValueType, SingleRowType} from '../../Component/Table/Interface/RecordsViewPropsInterface';
import {CopyFormatType, EXPORT_FILE, formatCopy, xmlText} from '../../Component/Table/Copy/CopyFormats';
import {binaryAsText, isBinaryValue, isLongText, longTextLabel} from '../Record/BinaryValue';
import createZip from './Zip';

export type ExportFormatType = CopyFormatType | 'xlsx' | 'ods' | 'pdf';

/** formats of export menu, in order */
export const EXPORT_FORMATS: {format: ExportFormatType, label: string}[] = [
  {format: 'csv', label: 'CSV'},
  {format: 'tsv-header', label: 'TSV'},
  {format: 'xlsx', label: 'Excel (XLSX)'},
  {format: 'ods', label: 'OpenDocument (ODS)'},
  {format: 'json', label: 'JSON'},
  {format: 'xml', label: 'XML'},
  {format: 'insert', label: 'SQL INSERT'},
  {format: 'markdown', label: 'Markdown'},
  {format: 'html', label: 'HTML'},
  {format: 'latex', label: 'LaTeX'},
  {format: 'pdf', label: 'PDF (print)…'},
];

const NUMERIC_TYPE = /^(tinyint|smallint|mediumint|int|integer|bigint|serial|smallserial|bigserial|decimal|numeric|float|double|real|year)\b/i;
const NUMBER = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
/** spreadsheets keep 15 digits - longer numbers (ids, bigint) stay texts */
const SAFE_DIGITS = 15;

type CellType = {kind: 'null'} | {kind: 'number', value: string} | {kind: 'string', value: string};

const cellOf = (column: ColumnInterface, value: CellValueType | undefined | object): CellType => {
  if (value === null || value === undefined) return {kind: 'null'};
  if (isBinaryValue(value)) return {kind: 'string', value: binaryAsText(value)};
  if (isLongText(value)) return {kind: 'string', value: longTextLabel(value)};
  if (typeof value === 'object') return {kind: 'string', value: JSON.stringify(value)};
  const text = String(value);
  if ((typeof value === 'number' || NUMERIC_TYPE.test(column.type || '')) && NUMBER.test(text) && text.replace(/[-.]|e.*$/gi, '').length <= SAFE_DIGITS) {
    return {kind: 'number', value: text};
  }
  return {kind: 'string', value: text};
};

/** A, B, ..., Z, AA */
const columnLetter = (index: number): string => {
  let name = '';
  for (let number = index + 1; number > 0; number = Math.floor((number - 1) / 26)) {
    name = String.fromCharCode(65 + ((number - 1) % 26)) + name;
  }
  return name;
};

const sheetName = (name: string) => (name.replace(/[[\]:*?/\\]/g, '_').slice(0, 31) || 'Sheet1');

/** Office Open XML workbook - one sheet, bold frozen header with filter, numbers as numbers */
export const buildXlsx = (columns: ColumnInterface[], rows: SingleRowType[], name: string): Uint8Array => {
  const cell = (reference: string, value: CellType, style: number = 0): string => {
    switch (value.kind) {
      case 'null': return '';
      case 'number': return `<c r="${reference}"${style ? ` s="${style}"` : ''}><v>${value.value}</v></c>`;
      default: return `<c r="${reference}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xmlText(value.value.slice(0, 32767))}</t></is></c>`;
    }
  };
  const header = `<row r="1">${columns.map((column, index) => cell(`${columnLetter(index)}1`, {kind: 'string', value: column.name}, 1)).join('')}</row>`;
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${columns.map((column, index) => cell(`${columnLetter(index)}${rowIndex + 2}`, cellOf(column, row[column.key]))).join('')}</row>`);
  const last = `${columnLetter(Math.max(0, columns.length - 1))}${rows.length + 1}`;
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<sheetData>${header}${body.join('')}</sheetData>`
    + (columns.length ? `<autoFilter ref="A1:${last}"/>` : '')
    + '</worksheet>';

  return createZip([
    {name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>'},
    {name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
      + '</Relationships>'},
    {name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + `<sheets><sheet name="${xmlText(sheetName(name))}" sheetId="1" r:id="rId1"/></sheets>`
      + (columns.length ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${xmlText(sheetName(name)).replace(/'/g, "''")}'!$A$1:$${last.replace(/\d+$/, '')}$${rows.length + 1}</definedName></definedNames>` : '')
      + '</workbook>'},
    {name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
      + '</Relationships>'},
    {name: 'xl/styles.xml', content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
      + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '</styleSheet>'},
    {name: 'xl/worksheets/sheet1.xml', content: sheet},
  ]);
};

/** OpenDocument spreadsheet - mimetype must be the first file of package */
export const buildOds = (columns: ColumnInterface[], rows: SingleRowType[], name: string): Uint8Array => {
  const cell = (value: CellType): string => {
    switch (value.kind) {
      case 'null': return '<table:table-cell/>';
      case 'number': return `<table:table-cell office:value-type="float" office:value="${value.value}"><text:p>${value.value}</text:p></table:table-cell>`;
      default: return `<table:table-cell office:value-type="string"><text:p>${xmlText(value.value)}</text:p></table:table-cell>`;
    }
  };
  const content = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"'
    + ' xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">'
    + `<office:body><office:spreadsheet><table:table table:name="${xmlText(sheetName(name))}">`
    + `<table:table-row>${columns.map((column) => cell({kind: 'string', value: column.name})).join('')}</table:table-row>`
    + rows.map((row) => `<table:table-row>${columns.map((column) => cell(cellOf(column, row[column.key]))).join('')}</table:table-row>`).join('')
    + '</table:table></office:spreadsheet></office:body></office:document-content>';
  return createZip([
    {name: 'mimetype', content: 'application/vnd.oasis.opendocument.spreadsheet'},
    {name: 'META-INF/manifest.xml', content: '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">'
      + '<manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>'
      + '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>'
      + '</manifest:manifest>'},
    {name: 'content.xml', content},
  ]);
};

/** HTML document with table - file export and printing */
export const htmlDocument = (columns: ColumnInterface[], rows: SingleRowType[], name: string, sql?: SqlLiteralInterface): string => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${xmlText(name)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; margin: 16px; }
  h1 { font-size: 15px; margin: 0 0 8px; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 2px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  td.null { color: #999; font-style: italic; }
  @page { size: landscape; margin: 10mm; }
</style>
</head>
<body>
<h1>${xmlText(name)} <small>(${rows.length} rows)</small></h1>
${formatCopy('html', columns, rows, name, sql)}
</body>
</html>
`;

const download = (fileName: string, data: BlobPart, mimeType: string) => {
  const url = URL.createObjectURL(new Blob([data], {type: mimeType}));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/**
 * rows as file in downloads; pdf - printable page in new window, browser saves it as PDF.
 * table - name for INSERT and XML, sql - quoting of the database
 */
const exportRows = (
  format: ExportFormatType,
  columns: ColumnInterface[],
  rows: SingleRowType[],
  name: string,
  table?: string,
  sql?: SqlLiteralInterface,
  /** window opened before rows were loaded */
  printWindow?: Window | null,
): boolean => {
  switch (format) {
    case 'xlsx':
      download(`${name}.xlsx`, buildXlsx(columns, rows, name), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return true;
    case 'ods':
      download(`${name}.ods`, buildOds(columns, rows, name), 'application/vnd.oasis.opendocument.spreadsheet');
      return true;
    case 'html':
      download(`${name}.html`, htmlDocument(columns, rows, name, sql), 'text/html;charset=utf-8');
      return true;
    case 'pdf': {
      const page = printWindow || window.open('', '_blank');
      if (!page) {
        return false;
      }
      page.document.open();
      page.document.write(htmlDocument(columns, rows, name, sql));
      page.document.close();
      page.focus();
      // dialog of browser - "Save as PDF"
      setTimeout(() => page.print(), 300);
      return true;
    }
    default: {
      const file = EXPORT_FILE[format];
      download(`${name}.${file.extension}`, formatCopy(format, columns, rows, table, sql), `${file.mimeType};charset=utf-8`);
      return true;
    }
  }
};

export default exportRows;
