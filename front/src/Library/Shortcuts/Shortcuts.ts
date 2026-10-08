
/** keyboard shortcuts shown in help (F1) - global ones are handled by ApplicationRenderer */
export const SHORTCUTS: {group: string, items: {keys: string, action: string}[]}[] = [
  {
    group: 'Tabs and application',
    items: [
      {keys: 'Alt + → / Alt + ←', action: 'Next / previous tab'},
      {keys: 'Alt + 1 … 9', action: 'Go to tab 1 … 8, 9 = last tab'},
      {keys: 'Alt + W', action: 'Close tab'},
      {keys: 'Middle click', action: 'Close tab / open table in new tab'},
      {keys: 'Alt + T', action: 'SQL console of connection of current tab'},
      {keys: 'Alt + Shift + D', action: 'Dark / light theme'},
      {keys: 'F1', action: 'This help'},
    ],
  },
  {
    group: 'Data grid',
    items: [
      {keys: 'Double click', action: 'Edit cell'},
      {keys: 'Enter / Escape', action: 'Confirm / cancel cell edit'},
      {keys: 'Ctrl + S', action: 'Submit pending changes'},
      {keys: 'Ctrl + click / Shift + click', action: 'Add cell / range to selection'},
      {keys: 'Ctrl + A', action: 'Select all cells'},
      {keys: 'Ctrl + C', action: 'Copy selection as TSV'},
      {keys: 'Escape', action: 'Clear selection'},
      {keys: 'Right click', action: 'Menu of cell / row / grid'},
    ],
  },
  {
    group: 'SQL editor',
    items: [
      {keys: 'Enter', action: 'Run query (query bar of table)'},
      {keys: 'Ctrl + Enter', action: 'Run selection or statement under cursor (console)'},
      {keys: 'Ctrl + Shift + Enter', action: 'Run all statements (console)'},
      {keys: 'Ctrl + Space', action: 'Completion of tables, columns and keywords'},
    ],
  },
];

/** help is opened by F1 or button in main menu */
export const SHORTCUT_HELP_EVENT = 'flase:shortcut-help';
