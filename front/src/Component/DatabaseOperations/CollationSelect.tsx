import React from 'react';
import {ServerOptionsInterface} from '../../Library/Database/Interface/DatabaseObjectsInterface';

interface CollationSelectPropsInterface {
  options: ServerOptionsInterface | null;
  value: string;
  onChange: (collation: string) => void;
  /** label of empty value, e.g. "Server default (utf8mb4_0900_ai_ci)" */
  emptyLabel?: string;
  autoFocus?: boolean;
}

/** CollationSelect - collations grouped by character set, utf8mb4 first */
export default (props: CollationSelectPropsInterface) => {
  const groups = new Map<string, {name: string, isDefault: boolean}[]>();
  (props.options?.collations || []).forEach((collation) => {
    if (!groups.has(collation.charset)) groups.set(collation.charset, []);
    groups.get(collation.charset)!.push(collation);
  });
  const charsets = Array.from(groups.keys()).sort((a, b) => (b === 'utf8mb4' ? 1 : 0) - (a === 'utf8mb4' ? 1 : 0) || a.localeCompare(b));
  const known = (props.options?.collations || []).some((collation) => collation.name === props.value);

  return (
    <select value={props.value} onChange={(event) => props.onChange(event.target.value)} autoFocus={props.autoFocus} aria-label="Collation">
      {props.emptyLabel !== undefined && <option value="">{props.emptyLabel}</option>}
      {props.emptyLabel === undefined && !props.value && <option value="" disabled>— choose collation —</option>}
      {props.value && !known && <option value={props.value}>{props.value}</option>}
      {charsets.map((charset) => (
        <optgroup key={charset} label={charset}>
          {groups.get(charset)!.map((collation) => (
            <option key={collation.name} value={collation.name}>{collation.name}{collation.isDefault ? ' (default)' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
