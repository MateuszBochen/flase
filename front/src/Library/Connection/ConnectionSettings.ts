import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import SettingsAPI from '../Settings/SettingsAPI';
import toast from 'react-hot-toast';
import EventBus from '../EventBus/EventBus';
import NewConnectionWasAdded from './Event/NewConnectionWasAdded';
import EstablishedConnectionInterface from './Interface/EstablishedConnectionInterface';


class ConnectionSettings {
  private static instance: ConnectionSettings;
  private readonly SETTINGS_KEY_NAME = 'connections';
  private readonly SETTINGS_KEY_ESTABLISHED_NAME = 'established_connections';

  private readonly connections: ConnectionDataInterface[] = [];
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


  addNewConnection = (data: ConnectionDataInterface) => {
    const areExistInList = this.connections.some((storedConnection) => storedConnection.displayName === data.displayName);
    if (areExistInList) {
      toast.error('Connection with same name already exist');
      return;
    }

    this.connections.push(data);
    SettingsAPI.setSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME, this.connections);
    toast.success('New connection was added');
    EventBus.emit(new NewConnectionWasAdded(data));
  }

  getConnections = ():ConnectionDataInterface[] => {
    return this.connections;
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
