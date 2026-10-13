/**
 * Main settings API interface
 * @author Mateusz Bochen
 */
class SettingsAPI {

  /**
   * Set new settings for application.
   * Write new json in local storage.
   * @author Mateusz Bochen
   */
  public static setSettings = <T>(keyStore:string, newSettings: T): void => {
    localStorage.setItem(keyStore, JSON.stringify(newSettings));
  }

  /**
   * Returns state of current settings
   * @author Mateusz Bochen
   */
  public static getSettings = <T>(keyStore:string): T|undefined => {
    const value = localStorage.getItem(keyStore);
    if (value) {
      try {
        return JSON.parse(value);
      } catch (e) {
        // corrupted value (edited by hand, other version) must not stop the application
        console.warn(`Settings ${keyStore} are not valid JSON - ignored`);
      }
    }
  }
}

export default SettingsAPI;
