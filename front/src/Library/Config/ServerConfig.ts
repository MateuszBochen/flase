import {useEffect, useState} from 'react';
import BaseRequest from '../API/Request/BaseRequest';
import EventBus from '../EventBus/EventBus';
import EventInterface from '../EventBus/EventInterface';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../Connection/ConnectionSettings';

export interface ServerConfigInterface {
  /** users can add own connections (FLASE_ALLOW_CUSTOM_CONNECTIONS) */
  allowCustomConnections: boolean;
  /** connections defined by administrator (FLASE_CONNECTIONS) */
  connections: ConnectionDataInterface[];
}

/** configuration of server was loaded */
export class ServerConfigWasLoaded implements EventInterface<ServerConfigInterface> {
  constructor(private readonly data: ServerConfigInterface) {
  }

  getData(): ServerConfigInterface {
    return this.data;
  }
}

/**
 * Configuration of Flase server - predefined connections and whether own connections are allowed.
 * Until it is loaded own connections are allowed (server refuses them anyway when they are not).
 */
class ServerConfig {
  private static config: ServerConfigInterface = {allowCustomConnections: true, connections: []};

  static get(): ServerConfigInterface {
    return ServerConfig.config;
  }

  static load(): Promise<void> {
    return new BaseRequest().promiseDoRequest(BaseRequest.METHOD_GET, '/api/config', {})
      .then((response) => {
        const data = response.data || {};
        ServerConfig.config = {
          allowCustomConnections: data.allowCustomConnections !== false,
          connections: Array.isArray(data.connections) ? data.connections.map((item: any) => ({...item, predefined: true})) : [],
        };
        ConnectionSettings.getInstance().applyServerConfig(ServerConfig.config.connections, ServerConfig.config.allowCustomConnections);
        EventBus.emit(new ServerConfigWasLoaded(ServerConfig.config));
      })
      .catch(() => {
        // older server without config - own connections only
      });
  }
}

/** current configuration, re-rendered when it is loaded */
export const useServerConfig = (): ServerConfigInterface => {
  const [config, setConfig] = useState<ServerConfigInterface>(ServerConfig.get());
  useEffect(() => {
    const eventId = EventBus.subscribe<ServerConfigInterface>(ServerConfigWasLoaded.name, (event) => setConfig(event.getData()));
    // loaded before subscription
    setConfig(ServerConfig.get());
    return () => EventBus.unSub(eventId);
  }, []);
  return config;
};

export default ServerConfig;
