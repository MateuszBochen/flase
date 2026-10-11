import React, {createContext, useContext, useEffect, useState} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {TransformType} from '../../../Library/CellTools/ColumnDisplay';
import {binaryLabel, BinaryValueInterface, formatBytes, isBinaryValue} from '../../../Library/Record/BinaryValue';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';

/** how cells of grid are shown - transformations of columns, labels of referenced rows */
export interface GridDisplayInterface {
  transforms: {[columnKey: string]: TransformType};
  /** label of referenced row by column key and value */
  labels: {[columnKey: string]: {[value: string]: string}};
}

/** loading of whole binary value and showing of image - given by records view */
export interface GridDisplayActionsInterface {
  /** null when row cannot be identified */
  loadBinary: (column: ColumnInterface, rowIndex: number) => Promise<{url: string, mimeType: string | null}> | null;
  openImage: (url: string, title: string) => void;
}

export const GridDisplayContext = createContext<GridDisplayActionsInterface | null>(null);

const MIME_BY_HEX: [RegExp, string][] = [
  [/^89504e470d0a1a0a/i, 'image/png'],
  [/^ffd8ff/i, 'image/jpeg'],
  [/^47494638/i, 'image/gif'],
  [/^52494646.{8}57454250/i, 'image/webp'],
  [/^424d/i, 'image/bmp'],
];

const imageMimeOf = (value: BinaryValueInterface): string | null => {
  const found = MIME_BY_HEX.find(([pattern]) => pattern.test(value.hex));
  if (found) return found[1];
  return value.text && /^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(value.text) ? 'image/svg+xml' : null;
};

/** data url of whole (not truncated) binary value */
const dataUrl = (value: BinaryValueInterface, mimeType: string): string => {
  const bytes = value.hex.match(/../g) || [];
  return `data:${mimeType};base64,${btoa(bytes.map((byte) => String.fromCharCode(parseInt(byte, 16))).join(''))}`;
};

const pad = (number: number) => String(number).padStart(2, '0');

/** seconds (or milliseconds) since 1970 as local date and time */
const unixTime = (value: CellValueType): string | null => {
  const number = Number(value);
  if (value === '' || !Number.isFinite(number)) return null;
  const date = new Date(Math.abs(number) > 1e11 ? number : number * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const hexOf = (value: CellValueType | BinaryValueInterface): string => {
  if (isBinaryValue(value)) return `0x${value.hex.toUpperCase()}${value.truncated ? '…' : ''}`;
  return `0x${Array.from(new TextEncoder().encode(String(value))).map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
};

/** image of binary value longer than preview - loaded when cell is shown */
const LoadedImage = (props: {column: ColumnInterface, rowIndex: number, value: BinaryValueInterface}) => {
  const actions = useContext(GridDisplayContext);
  const [image, setImage] = useState<{url: string, mimeType: string | null} | null | 'error'>(null);
  useEffect(() => {
    let active = true;
    const loading = actions?.loadBinary(props.column, props.rowIndex);
    if (!loading) {
      setImage('error');
      return;
    }
    loading.then((result) => active && setImage(result)).catch(() => active && setImage('error'));
    return () => {
      active = false;
    };
  }, [props.column, props.rowIndex, props.value]);
  if (image === 'error') return <span className="dtc-binary">{binaryLabel(props.value)}</span>;
  if (!image) return <span className="dtc-null">loading…</span>;
  if (!image.mimeType?.startsWith('image/')) return <span className="dtc-binary" title={image.mimeType || 'not an image'}>{binaryLabel(props.value)}</span>;
  return <Thumbnail url={image.url} title={`${props.column.name} · ${formatBytes(props.value.size)}`} />;
};

const Thumbnail = (props: {url: string, title: string}) => {
  const actions = useContext(GridDisplayContext);
  return (
    <img
      className="dtc-image"
      src={props.url}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      title={`${props.title} - click to show`}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        actions?.openImage(props.url, props.title);
      }}
    />
  );
};

/** value shown with transformation of its column, null when transformation does not fit the value */
export const renderTransformed = (
  value: CellValueType | BinaryValueInterface | undefined,
  transform: TransformType,
  column: ColumnInterface,
  rowIndex: number,
): React.ReactNode | null => {
  if (value === null || value === undefined || value === '' || !transform) return null;
  switch (transform) {
    case 'image': {
      if (!isBinaryValue(value)) return null;
      if (value.truncated) return <LoadedImage column={column} rowIndex={rowIndex} value={value} />;
      const mimeType = imageMimeOf(value);
      return mimeType ? <Thumbnail url={dataUrl(value, mimeType)} title={`${column.name} · ${formatBytes(value.size)}`} /> : null;
    }
    case 'imageUrl': {
      const text = String(value);
      return /^(https?:\/\/|data:image\/)/i.test(text) ? <Thumbnail url={text} title={text} /> : null;
    }
    case 'link': {
      const text = isBinaryValue(value) ? value.text || '' : String(value);
      const href = /^https?:\/\//i.test(text) ? text : /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? `mailto:${text}` : null;
      return href && (
        <a className="dtc-link" href={href} target="_blank" rel="noopener noreferrer" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          {text}
        </a>
      );
    }
    case 'unixTime': {
      const date = isBinaryValue(value) ? null : unixTime(value);
      return date && <span className="dtc-transformed" title={String(value)}>{date}</span>;
    }
    case 'bytes': {
      const number = Number(value);
      return !isBinaryValue(value) && Number.isFinite(number) ? <span className="dtc-transformed" title={String(value)}>{formatBytes(number)}</span> : null;
    }
    case 'bool': {
      const text = String(isBinaryValue(value) ? value.hex : value).toLowerCase();
      if (['1', 't', 'true', 'y', 'yes', 'on', '01'].includes(text)) return <span className="dtc-bool yes" title={String(text)}>✓</span>;
      if (['0', 'f', 'false', 'n', 'no', 'off', '00'].includes(text)) return <span className="dtc-bool no" title={String(text)}>✗</span>;
      return null;
    }
    case 'hex':
      return <span className="dtc-transformed">{hexOf(value)}</span>;
    default:
      return null;
  }
};
