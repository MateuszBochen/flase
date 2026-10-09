import React, {KeyboardEvent, useCallback, useEffect, useRef, useState} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';

interface CellEditorPropsInterface {
  column: ColumnInterface;
  value: CellValueType;
  /** inline - inside grid cell, commit on Enter / blur; form - inside row form, every change is reported */
  mode: 'inline' | 'form';
  onChange?: (value: CellValueType) => void;
  onCommit?: (value: CellValueType) => void;
  onCancel?: () => void;
  /** focus editor when shown (inline editor is always focused) */
  autoFocus?: boolean;
}

const placeholderForType = (type: string = ''): string => {
  if (/^datetime|^timestamp/i.test(type)) return 'YYYY-MM-DD HH:MM:SS';
  if (/^date/i.test(type)) return 'YYYY-MM-DD';
  if (/^time/i.test(type)) return 'HH:MM:SS';
  if (/^year/i.test(type)) return 'YYYY';
  return '';
};

const isNumericType = (type: string = ''): boolean => /int|decimal|numeric|float|double|real/i.test(type);

const isLongTextType = (type: string = ''): boolean => /text|json|^varchar\((\d{3,})\)/i.test(type);

/** CellEditor - editor matching column type: list for ENUM, text for others, NULL switch for nullable columns */
export default (props: CellEditorPropsInterface) => {
  const [text, setText] = useState<string>(props.value === null || props.value === undefined ? '' : String(props.value));
  const [isNull, setIsNull] = useState<boolean>(props.value === null);
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement & HTMLSelectElement | null>(null);
  const finished = useRef<boolean>(false);

  const currentValue = useCallback((): CellValueType => isNull ? null : text, [isNull, text]);

  useEffect(() => {
    if (props.mode === 'inline' || props.autoFocus) {
      // without preventScroll browser scrolls the overflow:hidden cell and its top border disappears
      inputRef.current?.focus({preventScroll: true});
      inputRef.current?.select?.();
    }
  }, []);

  const report = (newText: string, newIsNull: boolean) => {
    props.onChange?.(newIsNull ? null : newText);
  };

  const commit = useCallback(() => {
    if (!finished.current) {
      finished.current = true;
      props.onCommit?.(currentValue());
    }
  }, [currentValue, props.onCommit]);

  const cancel = useCallback(() => {
    finished.current = true;
    props.onCancel?.();
  }, [props.onCancel]);

  const onKeyDown = useCallback((event: KeyboardEvent) => {
    if (props.mode !== 'inline') {
      return;
    }
    // keep keys away from grid handlers
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }, [commit, cancel, props.mode]);

  const onTextChange = (newText: string) => {
    setText(newText);
    setIsNull(false);
    report(newText, false);
  };

  const toggleNull = () => {
    const newIsNull = !isNull;
    setIsNull(newIsNull);
    report(text, newIsNull);
    if (props.mode === 'inline') {
      inputRef.current?.focus({preventScroll: true});
    }
  };

  const onBlur = props.mode === 'inline' ? commit : undefined;
  const common = {
    ref: inputRef,
    className: `cell-editor-input ${isNull ? 'is-null' : ''}`,
    onKeyDown,
    onBlur,
  };

  let editor;
  if (props.column.enumValues) {
    editor = (
      <select
        {...common}
        value={isNull ? '' : text}
        onChange={(event) => onTextChange(event.target.value)}
      >
        {(isNull || !props.column.enumValues.includes(text)) && <option value="" disabled>{isNull ? 'NULL' : ''}</option>}
        {props.column.enumValues.map((enumValue) => <option key={enumValue} value={enumValue}>{enumValue}</option>)}
      </select>
    );
  } else if (props.mode === 'form' && isLongTextType(props.column.type)) {
    editor = (
      <textarea
        {...common}
        rows={4}
        value={text}
        placeholder={isNull ? 'NULL' : ''}
        onChange={(event) => onTextChange(event.target.value)}
      />
    );
  } else {
    editor = (
      <input
        {...common}
        type="text"
        inputMode={isNumericType(props.column.type) ? 'decimal' : undefined}
        value={text}
        placeholder={isNull ? 'NULL' : placeholderForType(props.column.type)}
        onChange={(event) => onTextChange(event.target.value)}
      />
    );
  }

  return (
    <div className={`cmp-cell-editor ${props.mode}`}>
      {editor}
      {props.column.nullable && (
        <button
          type="button"
          className={`cell-editor-null ${isNull ? 'active' : ''}`}
          title="Set NULL"
          // keep focus in input, blur would commit inline editor
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleNull}
        >
          NULL
        </button>
      )}
    </div>
  );
}
