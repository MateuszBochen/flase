

const crypto = require('crypto');

class Settings {
  private static generatedSecret: string | null = null;

  /**
   * secret of session tokens; without JWT_SECRET a random one is generated at start -
   * a known default secret would allow forged tokens, sessions are in memory and end with restart anyway
   */
  public static getJWTSecret(): string {
    if (process.env.JWT_SECRET) {
      return process.env.JWT_SECRET;
    }
    if (!Settings.generatedSecret) {
      Settings.generatedSecret = crypto.randomBytes(32).toString('hex');
    }
    return Settings.generatedSecret as string;
  }

  /** built front (index.html and assets) served by this server - production image */
  public static getFrontDirectory(): string | null {
    return process.env.FLASE_FRONT_DIR || null;
  }

  /** database connections of login without open websocket are closed after this time */
  public static getIdleConnectionReleaseMs(): number {
    const seconds = Number(process.env.IDLE_CONNECTION_RELEASE_SECONDS);
    return (Number.isFinite(seconds) && seconds > 0 ? seconds : 30) * 1000;
  }

  public static getJWTTokenExpire(): string {
    if (process.env.JWT_TOKEN_EXPIRE) {
      return process.env.JWT_TOKEN_EXPIRE;
    }
    return '1h';
  }

}
export default Settings;
