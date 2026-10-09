import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import SettingsAPI from '../Settings/SettingsAPI';
import toast from 'react-hot-toast';
import EventBus from '../EventBus/EventBus';
import NewConnectionWasAdded from './Event/NewConnectionWasAdded';
import ConnectionWasUpdated from './Event/ConnectionWasUpdated';
import ConnectionWasRemoved from './Event/ConnectionWasRemoved';
import EstablishedConnectionInterface from './Interface/EstablishedConnectionInterface';
import ConnectionListWasChanged from './Event/ConnectionListWasChanged';


class ConnectionSettings {
  private static instance: ConnectionSettings;
  private readonly SETTINGS_KEY_NAME = 'connections';
  private readonly SETTINGS_KEY_ESTABLISHED_NAME = 'established_connections';

  private readonly connections: ConnectionDataInterface[] = [];
  /** defined by administrator on server - not stored in browser */
  private predefined: ConnectionDataInterface[] = [];
  /** own connections are allowed by server */
  private allowCustom: boolean = true;
  private establishedConnections: {[key:string]: EstablishedConnectionInterface} = {};

  public static getInstance(): ConnectionSettings {
    if(!ConnectionSettings.instance) {
      ConnectionSettings.instance = new ConnectionSettings();
    }

    return ConnectionSettings.instance;
  }

  constructor() {
    const storedSettings = SettingsAPI.getSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME);
    const storedEstablishedConnections = SettingsAPI.getSettings<{[key:string]: EstablishedConnectionInterface}>(this.SETTINGS_KEY_ESTABLISHED_NAME);
    if (storedSettings) {
      this.connections = storedSettings;
    } else {
      this.connections = [];
    }

    if (storedEstablishedConnections) {
      this.establishedConnections = storedEstablishedConnections;
    } else {
      this.establishedConnections = {};
    }
  }


  /**
   * connections defined on server; objects of known ids are updated in place (open tabs keep reference)
   * without allowed own connections the stored ones are hidden (they stay stored, server refuses them)
   */
  applyServerConfig = (predefined: ConnectionDataInterface[], allowCustom: boolean) => {
    this.predefined = predefined.map((item) => {
      const existing = this.predefined.find((known) => known.id === item.id);
      return existing ? Object.assign(existing, item) : {...item, predefined: true};
    });
    this.allowCustom = allowCustom;
    EventBus.emit(new ConnectionListWasChanged());
  }

  canAddConnections = (): boolean => this.allowCustom;

  addNewConnection = (data: ConnectionDataInterface) => {
    if (!this.allowCustom) {
      toast.error('Only connections defined by administrator are allowed');
      return;
    }
    const areExistInList = this.getConnections().some((storedConnection) => storedConnection.displayName === data.displayName);
    if (areExistInList) {
      toast.error('Connection with same name already exist');
      return;
    }

    this.connections.push(data);
    SettingsAPI.setSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME, this.connections);
    toast.success('New connection was added');
    EventBus.emit(new NewConnectionWasAdded(data));
  }

  /**
   * name, color, read only... of existing connection.
   * Objects are changed in place - tabs keep reference to the same connection object and see new settings.
   */
  updateConnection = (id: string, changes: Partial<ConnectionDataInterface>): boolean => {
    const connection = this.connections.find((item) => item.id === id);
    if (!connection) {
      return false;
    }
    if (changes.displayName && this.getConnections().some((item) => item.id !== id && item.displayName === changes.displayName)) {
      toast.error('Connection with same name already exist');
      return false;
    }
    Object.assign(connection, changes);
    SettingsAPI.setSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME, this.connections);
    // commands are sent with connection stored at login - server reads read only flag from it
    const established = this.establishedConnections[id];
    if (established) {
      Object.assign(established.connection, changes);
      SettingsAPI.setSettings<{[key:string]: EstablishedConnectionInterface}>(this.SETTINGS_KEY_ESTABLISHED_NAME, this.establishedConnections);
    }
    EventBus.emit(new ConnectionWasUpdated(connection));
    return true;
  }

  /** saved connection is deleted (it must be disconnected before) */
  removeConnection = (id: string): void => {
    const index = this.connections.findIndex((item) => item.id === id);
    if (index === -1) {
      return;
    }
    const [removed] = this.connections.splice(index, 1);
    SettingsAPI.setSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME, this.connections);
    if (this.establishedConnections[id]) {
      delete this.establishedConnections[id];
      SettingsAPI.setSettings<{[key:string]: EstablishedConnectionInterface}>(this.SETTINGS_KEY_ESTABLISHED_NAME, this.establishedConnections);
    }
    // remembered positions of ER diagrams
    try {
      Object.keys(localStorage).filter((key) => key.startsWith(`er_positions:${id}:`)).forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      // storage is not available
    }
    EventBus.emit(new ConnectionWasRemoved(removed));
  }

  getConnection = (id: string): ConnectionDataInterface | undefined => {
    return this.getConnections().find((item) => item.id === id);
  }

  /** predefined (server) first, then own ones when they are allowed */
  getConnections = ():ConnectionDataInterface[] => {
    return this.allowCustom ? [...this.predefined, ...this.connections] : this.predefined;
  }

  getEstablishedConnection = ():{[key:string]: EstablishedConnectionInterface} => {
    return this.establishedConnections;
  }

  addNewEstablishedConnection(data: EstablishedConnectionInterface) {
    this.establishedConnections[data.connection.id] = data;
    SettingsAPI.setSettings<{[key:string]: EstablishedConnectionInterface}>(this.SETTINGS_KEY_ESTABLISHED_NAME, this.establishedConnections);
  }

  saveNewListOfEstablishedConnection(newList: {[key:string]: EstablishedConnectionInterface}) {
    this.establishedConnections = newList;
    SettingsAPI.setSettings<{[key:string]: EstablishedConnectionInterface}>(this.SETTINGS_KEY_ESTABLISHED_NAME, this.establishedConnections);
  }
}

export default ConnectionSettings;
