import React, {FC} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
  faCircleHalfStroke,
  faDiagramProject,
  faKeyboard,
  faLock,
  faNetworkWired,
  faRightLeft,
  faTableCells,
  faTableColumns,
  faTerminal,
  faUsersGear,
} from '@fortawesome/free-solid-svg-icons';
import EventBus from '../../../Library/EventBus/EventBus';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import NewDatabaseConnection from '../NewDatabaseConnection/NewDatabaseConnection';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import ThemeManager from '../../../Library/Theme/ThemeManager';
import {SHORTCUT_HELP_EVENT} from '../../../Library/Shortcuts/Shortcuts';
import './style.css';

const FEATURES = [
  {icon: faTableCells, title: 'Data grid', text: 'Edit cells and rows, multi selection, quick filters, foreign key navigation, copy as CSV / SQL / Markdown.'},
  {icon: faTableColumns, title: 'Structure', text: 'Columns, indexes, keys and triggers. Every DDL is previewed as SQL before execution.'},
  {icon: faTerminal, title: 'SQL console', text: 'Many statements, results in tabs, history, saved queries, EXPLAIN and cancel of running query.'},
  {icon: faRightLeft, title: 'Import / export', text: 'Streamed SQL dumps (also gzip), SQL and CSV import with progress, column mapping and preview.'},
  {icon: faDiagramProject, title: 'ER diagram', text: 'Tables and relations of database, movable layout, export to SVG.'},
  {icon: faUsersGear, title: 'Users & privileges', text: 'Accounts, roles and GRANTs of MySQL, MariaDB and PostgreSQL.'},
  {icon: faLock, title: 'Safe production', text: 'Colored connections, read only mode enforced by server and database session.'},
];

/**
 * Welcome page - quick actions and overview of features
 * @author Mateusz Bochen
 */
const WhatsNew: FC<undefined> = () => {
  const connections = ConnectionSettings.getInstance().getConnections().length;

  const newConnection = () => EventBus.emit(new NewTabComponentWasSelected<undefined>({
    component: NewDatabaseConnection,
    props: undefined,
    tabName: 'New connection',
    isActive: false,
    activate: true,
  }));

  return (
    <div className="cmp-welcome">
      <div className="welcome-hero">
        <div className="welcome-mark">F</div>
        <div>
          <h1>Flase</h1>
          <p>Fast database manager for MySQL, MariaDB and PostgreSQL.</p>
        </div>
      </div>

      <div className="welcome-actions">
        <button type="button" className="welcome-action primary" onClick={newConnection}>
          <FontAwesomeIcon icon={faNetworkWired} />
          <span><b>New connection</b><small>{connections ? `${connections} saved - open them in the left panel` : 'mysql://, mariadb://, postgresql://'}</small></span>
        </button>
        <button type="button" className="welcome-action" onClick={() => window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT))}>
          <FontAwesomeIcon icon={faKeyboard} />
          <span><b>Keyboard shortcuts</b><small>F1 anywhere</small></span>
        </button>
        <button type="button" className="welcome-action" onClick={() => ThemeManager.toggle()}>
          <FontAwesomeIcon icon={faCircleHalfStroke} />
          <span><b>Dark / light theme</b><small>Alt + Shift + D</small></span>
        </button>
      </div>

      <h2>What you can do</h2>
      <div className="welcome-features">
        {FEATURES.map((feature) => (
          <div className="welcome-feature" key={feature.title}>
            <div className="welcome-feature-icon"><FontAwesomeIcon icon={feature.icon} /></div>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default WhatsNew;
