import React, {ChangeEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import Editor, {OnMount} from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import './style.css';
import EditorPropsInterface from './Interface/EditorPropsInterface';
import {registerSqlCompletion} from './SqlCompletion';


/** Editor */
export default (props: EditorPropsInterface) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor|null>(null);
  const propsRef = useRef<EditorPropsInterface>(props);
  propsRef.current = props;
  const unregisterCompletion = useRef<(() => void) | null>(null);

  useEffect(() => () => unregisterCompletion.current?.(), []);

  useEffect(() => {
    if(editorRef.current) {
      if (editorRef.current.getValue() !== props.defaultText) {
        editorRef.current.setValue(props.defaultText);
      }
    }
  }, [props.defaultText]);

  const handleEditorMount: OnMount = useCallback((editor, monacoInstance) => {
    editorRef.current = editor;

    /** disable enter if is oneliner */
    if (props.isOneliner) {
      editor.onKeyDown((e) => {
        const suggestController = editor.getContribution<any>("editor.contrib.suggestController");
        if (suggestController && suggestController.model && suggestController.model.state !== 0) {
          return;
        }

        if (e.code === 'Enter' || e.keyCode === 13 || e.code === 'NumpadEnter') {
          e.preventDefault();
          if (props.onSearch) {
            props.onSearch(editor.getValue());
          }
        }
      });
    }

    const model = editor.getModel();
    if (model) {
      // latest props are read through ref - provider lives as long as editor
      unregisterCompletion.current = registerSqlCompletion(monacoInstance as any, model, () => ({
        keywords: propsRef.current.customKeyWords || [],
        tables: propsRef.current.getCompletionTables?.() || [],
        completionName: propsRef.current.completionName,
      }));
    }
    propsRef.current.onEditorMount?.(editor, monacoInstance);
  }, [props.hints, props.isOneliner]);

  return (
    <div className={`editor-syntax-highlighter-wrapper ${props.isOneliner ? 'is-oneliner' : ''}`}>
      <Editor
        theme="vs-dark"
        height="100%"
        width={'100%'}
        defaultLanguage="sql"
        defaultValue={props.defaultText}
        onMount={handleEditorMount}
        options={{

          suggestOnTriggerCharacters: true,
          quickSuggestions: true,
          minimap: { enabled: false },
          lineNumbers: props.isOneliner ? 'off' : 'on',
          wordWrap: props.isOneliner ? 'off' : 'on',
          wrappingIndent: props.isOneliner ? 'none' : 'same',
          renderLineHighlight: props.isOneliner ? 'none' : 'all',
          lineDecorationsWidth: props.isOneliner ? 0 : 10,
          lineNumbersMinChars: props.isOneliner ? 0 : 5,
          scrollBeyondLastLine: !props.isOneliner,
          folding: !props.isOneliner,
          glyphMargin: !props.isOneliner,
          overviewRulerLanes: 0,
          padding: {top: 6, bottom: 0},
        }}
      />
    </div>
  );
}
