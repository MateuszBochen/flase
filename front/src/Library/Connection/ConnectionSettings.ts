import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import SettingsAPI from '../Settings/SettingsAPI';
import toast from 'react-hot-toast';
import EventBus from '../EventBus/EventBus';
import NewConnectionWasAdded from './Event/NewConnectionWasAdded';


class ConnectionSettings {
  private static instance: ConnectionSettings;
  private readonly SETTINGS_KEY_NAME = 'connections';

  private readonly connections:ConnectionDataInterface[] = [];

  public static getInstance(): ConnectionSettings {
    if(!ConnectionSettings.instance) {
      ConnectionSettings.instance = new ConnectionSettings();
    }

    return ConnectionSettings.instance;
  }


  constructor() {
    const storedSettings = SettingsAPI.getSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME)
    if (storedSettings) {
      this.connections = storedSettings;
    } else {
      this.connections = [];
    }
  }


  addNewConnection = (data: ConnectionDataInterface) => {
    this.connections.push(data);
    SettingsAPI.setSettings<ConnectionDataInterface[]>(this.SETTINGS_KEY_NAME, this.connections);
    toast.success('New connection was added');
    EventBus.emit(new NewConnectionWasAdded(data));
  }
}

export default ConnectionSettings;
