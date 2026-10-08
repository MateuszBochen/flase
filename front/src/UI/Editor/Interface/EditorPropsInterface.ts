import {ChangeEvent, KeyboardEvent} from 'react';
import {CompletionTableType} from '../SqlCompletion';

interface EditorPropsInterface {
  defaultText: string;
  syntax: string;
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (value: string, event: KeyboardEvent<HTMLInputElement>) => void;
  onSearch?: (query: string) => void;
  hints?: string[];
  /** tables and their columns for autocompletion */
  getCompletionTables?: () => CompletionTableType[];
  customKeyWords?: string[];
  isOneliner?: boolean;
  /** access to monaco editor, e.g. keyboard commands, selection */
  onEditorMount?: (editor: any, monaco: any) => void;
}
export default EditorPropsInterface;
