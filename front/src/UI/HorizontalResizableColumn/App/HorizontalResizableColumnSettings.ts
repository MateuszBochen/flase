import SettingsAPI from '../../../Library/Settings/SettingsAPI';

interface SettingsListInterface {
  [key: string]: string;
}

/**
 * Horizontal resizeable columns settings.
 * Here is place to store of width of column
 * @author Mateusz Bochen
 */
class HorizontalResizableColumnSettings {

  private static settingsKeyStore = 'HorizontalResizableColumnSettings';
  private static defaultValue = '15%';
  private static instance:HorizontalResizableColumnSettings;

  private list:SettingsListInterface;

  /**
   * Public static
   */
  public static getInstance(): HorizontalResizableColumnSettings {
    if (!HorizontalResizableColumnSettings.instance) {
      HorizontalResizableColumnSettings.instance = new HorizontalResizableColumnSettings();
    }

    return HorizontalResizableColumnSettings.instance;
  }


  constructor() {
    const list = SettingsAPI.getSettings<SettingsListInterface>(HorizontalResizableColumnSettings.settingsKeyStore);
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

    return HorizontalResizableColumnSettings.defaultValue;
  }

  /** save new value for column width*/
  public setValue(name:string, newValue: string): void {
    this.list[name] = newValue;
    SettingsAPI.setSettings<SettingsListInterface>(HorizontalResizableColumnSettings.settingsKeyStore, this.list);
  }
}

export default HorizontalResizableColumnSettings;
