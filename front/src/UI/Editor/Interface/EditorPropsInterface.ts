import {ChangeEvent, KeyboardEvent} from 'react';

interface EditorPropsInterface {
  defaultText: string;
  syntax: string;
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (value: string, event: KeyboardEvent<HTMLInputElement>) => void;
  onSearch?: (query: string) => void;
  hints?: string[];
  isOneliner?: boolean;
}
export default EditorPropsInterface;
