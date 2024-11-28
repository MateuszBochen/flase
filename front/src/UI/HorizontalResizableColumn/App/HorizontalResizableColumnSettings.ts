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

  public static getDefaultWithForName(name: string): string {
    const list = SettingsAPI.getSettings<SettingsListInterface>(HorizontalResizableColumnSettings.settingsKeyStore);
    if (list) {
      for (const [key, value] of Object.entries(list)) {
        if (key === name) {
          return value;
        }
      }
    }

    return HorizontalResizableColumnSettings.defaultValue;
  }
}

export default HorizontalResizableColumnSettings;
