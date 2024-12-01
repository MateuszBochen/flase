

class Settings {

  public static getJWTSecret(): string {
    if (process.env.JWT_SECRET) {
      return process.env.JWT_SECRET;
    }
    return 'SAMPLE_JWT_SECRET';
  }

  public static getJWTTokenExpire(): string {
    if (process.env.JWT_TOKEN_EXPIRE) {
      return process.env.JWT_TOKEN_EXPIRE;
    }
    return '1h';
  }

}
export default Settings;
