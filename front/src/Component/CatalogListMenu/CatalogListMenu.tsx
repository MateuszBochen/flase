import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowsRotate, faDatabase, faTerminal} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import EstablishedConnectionInterface from '../../Library/Connection/Interface/EstablishedConnectionInterface';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import Catalogs, {CatalogInterface} from '../../Library/Connection/Catalogs';
import DatabaseManger from '../../Library/Database/DatabaseManger';
import EventBus from '../../Library/EventBus/EventBus';
import EventInterface from '../../Library/EventBus/EventInterface';
import WebsocketConnectionWasClosed from '../../Library/WebSocket/Event/WebsocketConnectionWasClosed';
import {formatBytes} from '../../Library/Record/BinaryValue';
import VerticalSlider from '../../UI/VerticalSlider/VerticalSlider';
import VerticalSliderItem from '../../UI/VerticalSlider/Interface/VerticalSliderItem';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import Box from '../../UI/Box/Box';
import TabOpener from '../TabOpener/TabOpener';
import DatabaseListMenu from '../DatabaseListMenu/DatabaseListMenu';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';
import './style.css';

const manager = ConnectionManager.getInstance();

/** schemas of database - connection of the database is opened with login of parent connection when item is shown */
const CatalogItem = (props: {parent: ConnectionDataInterface, catalog: CatalogInterface}) => {
  const child = useMemo(() => Catalogs.childConnection(props.parent, props.catalog.name), [props.parent, props.catalog.name]);
  const [status, setStatus] = useState<'connecting' | 'ready' | {error: string}>(props.catalog.canConnect ? 'connecting' : {error: 'No CONNECT privilege for this database'});

  const loadSchemas = useCallback((force: boolean) => {
    try {
      const established = manager.getEstablishedConnection(child);
      if (force || !DatabaseManger.getInstance().getListOfDatabaseForConnection(established).length) {
        DatabaseManger.getInstance().aksForDatabaseList(established);
      }
    } catch (e) {
      // not connected
    }
  }, [child]);

  const connect = useCallback(() => {
    if (!props.catalog.canConnect) return;
    setStatus('connecting');
    manager.connectDatabase(props.parent, child)
      .then(() => {
        setStatus('ready');
        loadSchemas(false);
      })
      .catch((e) => setStatus({error: e?.message || String(e)}));
  }, [props.parent, child, props.catalog.canConnect, loadSchemas]);

  useEffect(() => {
    connect();
    // session of database expired (server restart) - opened again while parent is connected
    const closedId = EventBus.subscribe(WebsocketConnectionWasClosed.name, (event: EventInterface<EstablishedConnectionInterface>) => {
      if (event.getData().connection.id === child.id) {
        setTimeout(() => manager.checkIfConnectionIsActive(props.parent) ? connect() : setStatus({error: `${props.parent.displayName} is not connected`}), 300);
      }
    });
    const establishedId = EventBus.subscribe(ConnectionWasEstablished.name, () => {
      if (!manager.checkIfConnectionIsActive(child) && manager.checkIfConnectionIsActive(props.parent)) connect();
    });
    return () => {
      EventBus.unSub(closedId);
      EventBus.unSub(establishedId);
    };
  }, [child.id]);

  if (status === 'connecting') {
    return <div className="catalog-status">Connecting to {props.catalog.name}…</div>;
  }
  if (typeof status === 'object') {
    return (
      <div className="catalog-status error">
        {status.error}
        {props.catalog.canConnect && <button type="button" onClick={connect}>Try again</button>}
      </div>
    );
  }
  return (
    <Box maxPossibleHeight={true}>
      <HorizontalButtonList>
        <TabOpener<SqlConsolePropsInterface>
          tooltip={`SQL console of database ${props.catalog.name}`}
          tab={{component: SqlConsole, props: {connection: child, database: null}, tabName: `Console: ${child.displayName}`, isActive: false}}
        >
          <FontAwesomeIcon icon={faTerminal} />
        </TabOpener>
        <InvisibleButton tooltip={`Reload schemas of ${props.catalog.name}`} onClickLeft={() => loadSchemas(true)} onClickWheel={() => loadSchemas(true)}>
          <FontAwesomeIcon icon={faArrowsRotate} />
        </InvisibleButton>
      </HorizontalButtonList>
      <DatabaseListMenu connection={child} />
    </Box>
  );
};

/** CatalogListMenu - databases of PostgreSQL server, each with its schemas */
export default (props: {connection: ConnectionDataInterface, collapseSignal?: number}) => {
  const [list, setList] = useState<CatalogInterface[] | null>(Catalogs.listOf(props.connection));

  useEffect(() => {
    setList(Catalogs.listOf(props.connection));
    const eventId = EventBus.subscribe(Catalogs.eventName, (event: EventInterface<string>) => {
      if (event.getData() === props.connection.id) setList(Catalogs.listOf(props.connection));
    });
    return () => EventBus.unSub(eventId);
  }, [props.connection.id]);

  if (!list) {
    return null;
  }
  const items: VerticalSliderItem[] = list.map((catalog) => ({
    id: catalog.name,
    label: catalog.name,
    chevron: true,
    suffix: (
      <span className={`catalog-suffix ${catalog.canConnect ? '' : 'denied'}`} title={catalog.current ? 'Database of the connection itself' : undefined}>
        <FontAwesomeIcon icon={faDatabase} />
        {catalog.size !== null ? ` ${formatBytes(catalog.size)}` : ' no access'}
      </span>
    ),
    component: <CatalogItem parent={props.connection} catalog={catalog} key={catalog.name} />,
  }));

  return (
    <Box maxPossibleHeight={true} className="cmp-catalog-list">
      <VerticalSlider items={items} multiple={true} allowClose={true} automateOpenFirst={false} storageKey={`open-catalog:${props.connection.id}`} labelIfEmpty="No database" collapseSignal={props.collapseSignal} />
    </Box>
  );
};
