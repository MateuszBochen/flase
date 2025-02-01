import React, {ChangeEvent, KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import Editor, {OnMount} from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

import './style.css';
import EditorPropsInterface from './Interface/EditorPropsInterface';


/** Editor */
export default (props: EditorPropsInterface) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor|null>(null);

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

    monacoInstance.languages.registerCompletionItemProvider('sql', {
      provideCompletionItems: (model, position) => {

        const wordInfo = model.getWordUntilPosition(position);
        const range = new monaco.Range(
          position.lineNumber,
          wordInfo.startColumn,
          position.lineNumber,
          wordInfo.endColumn
        );

        const tableSuggestions: monaco.languages.CompletionItem[] = [{
          label: 'Label',
          kind: monaco.languages.CompletionItemKind.Class,
          insertText: 'Insert text',
          range: range,
        }];

        props.customKeyWords?.forEach((sqlHint) => {
          tableSuggestions.push({
            label: sqlHint,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: sqlHint,
            range: range,
          });
        });

        return {
          suggestions: [...tableSuggestions]
        };
      }
    });
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
