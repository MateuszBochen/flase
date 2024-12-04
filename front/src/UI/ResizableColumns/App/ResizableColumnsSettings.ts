import SettingsAPI from '../../../Library/Settings/SettingsAPI';

interface SettingsListInterface {
  [key: string]: string;
}

/**
 * Horizontal resizeable columns settings.
 * Here is place to store of width of column
 * @author Mateusz Bochen
 */
class ResizableColumnsSettings {

  private static settingsKeyStore = 'HorizontalResizableColumnSettings';
  private static defaultValue = '15%';
  private static instance:ResizableColumnsSettings;

  private readonly list:SettingsListInterface;

  /**
   * Public static
   */
  public static getInstance(): ResizableColumnsSettings {
    if (!ResizableColumnsSettings.instance) {
      ResizableColumnsSettings.instance = new ResizableColumnsSettings();
    }

    return ResizableColumnsSettings.instance;
  }


  constructor() {
    const list = SettingsAPI.getSettings<SettingsListInterface>(ResizableColumnsSettings.settingsKeyStore);
    if (list) {
      this.list = list;
    } else {
      this.list = {};
    }
  }

  /** function getting saved value on first run for selected horizontal column */
  public getDefaultWithForName(name: string): string {

    if (this.list) {
      for (const [key, value] of Object.entries(this.list)) {
        if (key === name) {
          return value;
        }
      }
    }

    return ResizableColumnsSettings.defaultValue;
  }

  /** save new value for column width*/
  public setValue(name:string, newValue: string): void {
    this.list[name] = newValue;
    SettingsAPI.setSettings<SettingsListInterface>(ResizableColumnsSettings.settingsKeyStore, this.list);
  }
}

export default ResizableColumnsSettings;
