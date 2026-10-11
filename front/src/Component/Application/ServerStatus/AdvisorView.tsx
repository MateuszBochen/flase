import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowsRotate, faCircleCheck, faCircleExclamation, faCircleInfo, faTriangleExclamation} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useServerRequest from '../../../Library/Server/useServerRequest';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import {ServerStatusInterface} from '../../../Library/Server/ServerInterface';

interface AdvisorViewPropsInterface {
  connection: ConnectionDataInterface;
  tabId: string;
  readOnly: boolean;
  onEditVariable: (name: string) => void;
}

const ICONS = {info: faCircleInfo, warning: faTriangleExclamation, critical: faCircleExclamation};
const ORDER = {critical: 0, warning: 1, info: 2};

/** AdvisorView - rules comparing counters of running server with its configuration */
export default (props: AdvisorViewPropsInterface) => {
  const request = useServerRequest<ServerStatusInterface>(props.connection, `${props.tabId}:advisor`, CommandType.GET_SERVER_STATUS, MessageType.SERVER_STATUS, {auto: false});
  const advice = (request.data?.advice || []).slice().sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);

  React.useEffect(() => {
    request.load({withAdvice: true});
  }, []);

  return (
    <div className="server-advisor">
      <div className="server-view-toolbar">
        <span className="server-view-count">
          Advice is based on counters since start of server and on its configuration - check it against the real workload.
        </span>
        <button type="button" onClick={() => request.load({withAdvice: true})} aria-label="Check again" title="Check again">
          <FontAwesomeIcon icon={faArrowsRotate} spin={request.loading} /> Check again
        </button>
      </div>
      {request.error && <div className="structure-error">{request.error}</div>}
      {request.data && !advice.length && (
        <div className="server-advice ok"><FontAwesomeIcon icon={faCircleCheck} /> <strong>No problems found</strong></div>
      )}
      {advice.map((item, index) => (
        <div key={index} className={`server-advice ${item.severity}`}>
          <FontAwesomeIcon icon={ICONS[item.severity]} className="server-advice-icon" />
          <div>
            <strong>{item.title}</strong>
            <div>{item.detail}</div>
            <div className="server-advice-recommendation">{item.recommendation}</div>
          </div>
          {item.variable && (
            <button type="button" onClick={() => props.onEditVariable(item.variable!)} title={`Show ${item.variable} in variables`}>
              {props.readOnly ? 'Show' : 'Change'} {item.variable}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
