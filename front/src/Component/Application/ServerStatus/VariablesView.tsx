import React, {useEffect, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowsRotate} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useServerRequest from '../../../Library/Server/useServerRequest';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import {ServerVariableInterface, ServerVariablesInterface} from '../../../Library/Server/ServerInterface';
import ContextMenu from '../../../UI/ContextMenu/ContextMenu';
import SetVariablePopup from './SetVariablePopup';

interface VariablesViewPropsInterface {
  connection: ConnectionDataInterface;
  tabId: string;
  readOnly: boolean;
  /** variable to edit (from advisor) */
  editRequest: {name: string, at: number} | null;
}

/** VariablesView - configuration of server with filter, change of value */
export default (props: VariablesViewPropsInterface) => {
  const request = useServerRequest<ServerVariablesInterface>(props.connection, `${props.tabId}:variables`, CommandType.GET_SERVER_VARIABLES, MessageType.SERVER_VARIABLES);
  const [filter, setFilter] = useState<string>('');
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const [editing, setEditing] = useState<ServerVariableInterface | null>(null);
  const [menu, setMenu] = useState<{x: number, y: number, variable: ServerVariableInterface} | null>(null);
  const variables = request.data?.variables || [];

  // advisor asks for edit of variable
  useEffect(() => {
    if (!props.editRequest) return;
    setFilter(props.editRequest.name);
    const variable = variables.find((item) => item.name === props.editRequest!.name);
    if (variable && variable.editable !== false && !props.readOnly) setEditing(variable);
  }, [props.editRequest, request.data]);

  const shown = useMemo(() => {
    const terms = filter.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);
    return variables.filter((variable) => (!terms.length || terms.some((term) => variable.name.includes(term) || (variable.description || '').toLowerCase().includes(term)))
      && (!changedOnly || (variable.defaultValue !== null ? variable.value !== variable.defaultValue : !/^(default|COMPILED)$/i.test(variable.source || ''))));
  }, [variables, filter, changedOnly]);

  const canEdit = (variable: ServerVariableInterface) => !props.readOnly && variable.editable !== false;

  return (
    <div className="server-variables">
      <div className="server-view-toolbar">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter variables (name or description, comma = or)…" aria-label="Filter variables" />
        <label className="checkbox">
          <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />
          Only changed from default
        </label>
        <span className="server-view-count">{shown.length} / {variables.length}</span>
        <button type="button" onClick={() => request.load()} title="Reload" aria-label="Reload variables"><FontAwesomeIcon icon={faArrowsRotate} spin={request.loading} /></button>
      </div>
      {request.error && <div className="structure-error">{request.error}</div>}
      <table className="structure-table server-table">
        <thead><tr><th>Name</th><th>Value</th><th>Default</th><th>Source</th><th>Description</th></tr></thead>
        <tbody>
          {shown.map((variable) => (
            <tr
              key={variable.name}
              className={`structure-row ${canEdit(variable) ? 'editable' : ''}`}
              onDoubleClick={() => canEdit(variable) && setEditing(variable)}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenu({x: event.clientX, y: event.clientY, variable});
              }}
            >
              <td className="name">
                {variable.name}
                {variable.pendingRestart && <span className="server-badge warning" title="Changed value waits for restart">restart pending</span>}
                {variable.needsRestart && !variable.pendingRestart && <span className="server-badge" title="Change is used after restart">restart</span>}
                {variable.editable === false && <span className="server-badge" title="Cannot be changed while server runs">read only</span>}
              </td>
              <td className="type value">{variable.display ?? variable.value}{variable.display === null && variable.unit ? <span className="muted"> {variable.unit}</span> : null}</td>
              <td className="muted">{variable.defaultValue}</td>
              <td className="muted">{variable.source}</td>
              <td className="description" title={variable.description || ''}>{variable.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {label: 'Change value…', disabled: !canEdit(menu.variable), onClick: () => setEditing(menu.variable)},
            'separator',
            {label: 'Copy name', onClick: () => navigator.clipboard?.writeText(menu.variable.name).then(() => toast.success('Copied'))},
            {label: 'Copy value', onClick: () => navigator.clipboard?.writeText(menu.variable.value).then(() => toast.success('Copied'))},
          ]}
        />
      )}
      {editing && request.data && (
        <SetVariablePopup
          connection={props.connection}
          variable={editing}
          variables={request.data}
          tabId={`${props.tabId}:set`}
          onCancel={() => setEditing(null)}
          onApplied={() => {
            setEditing(null);
            // PostgreSQL reloads configuration asynchronously
            setTimeout(() => request.load(), 400);
          }}
        />
      )}
    </div>
  );
}
