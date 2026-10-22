import React, {FormEvent} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faLock, faPlug} from '@fortawesome/free-solid-svg-icons';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import EventBus from '../../../Library/EventBus/EventBus';
import ConnectionFormWasSubmitted from '../../ConnectionForm/Event/ConnectionFormWasSubmitted';
import {useServerConfig} from '../../../Library/Config/ServerConfig';
import useConnectionForm from './useConnectionForm';
import './style.css';

/** NewDatabaseConnection - engine, address (host / port / database or DSN), user, color and safety options */
export default () => {
  const {allowCustomConnections} = useServerConfig();
  const form = useConnectionForm();

  const save = (connect: boolean) => {
    const data = form.validated();
    if (!data) return;
    ConnectionSettings.getInstance().addNewConnection(data);
    if (connect) {
      EventBus.emit(new ConnectionFormWasSubmitted({userData: form.userData(), connectionData: data,
        rememberPassword: form.rememberPassword || undefined}));
    }
    form.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save(true);
  };

  if (!allowCustomConnections) {
    return (
      <div className="cmp-new-connection">
        <div className="new-connection-card">
          <div className="new-connection-header">
            <div className="new-connection-mark"><FontAwesomeIcon icon={faLock} /></div>
            <div>
              <h1>Connections are managed by administrator</h1>
              <p>This Flase server allows only connections defined in its configuration. Use them from the left panel.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cmp-new-connection">
      <form className="new-connection-card" onSubmit={onSubmit} noValidate>
        <div className="new-connection-header">
          <div className="new-connection-mark"><FontAwesomeIcon icon={faPlug} /></div>
          <div>
            <h1>New connection</h1>
            <p>MySQL, MariaDB or PostgreSQL server. Connection is saved in this browser, password only when you choose to remember it.</p>
          </div>
        </div>

        {form.fields}

        <div className="new-connection-footer">
          {form.testResult}
          <button type="button" className="secondary" onClick={form.testConnection} disabled={form.test.status === 'testing'}>Test connection</button>
          <button type="button" className="secondary" onClick={() => save(false)}>Save</button>
          <button type="submit" className="primary">Save &amp; connect</button>
        </div>
      </form>
    </div>
  );
}
