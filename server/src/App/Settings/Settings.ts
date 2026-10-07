

class Settings {

  public static getJWTSecret(): string {
    if (process.env.JWT_SECRET) {
      return process.env.JWT_SECRET;
    }
    return 'SAMPLE_JWT_SECRET';
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
