import Settings from '../Settings/Settings';
import JwtPayload from './Interface/JwtPayload';

const jwt = require('jsonwebtoken');

class JWT {
  public static getJwtToken(payload: JwtPayload): string {
    const options = {
      expiresIn: Settings.getJWTTokenExpire(),
    }

    return jwt.sign({username: payload.username, sessionId: payload.sessionId}, Settings.getJWTSecret(), options);
  }

  /** returns payload of valid token, null for invalid or expired token */
  public static verify(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, Settings.getJWTSecret()) as JwtPayload;
    } catch (e) {
      return null;
    }
  }

  /** payload of token with valid signature, also when it is expired - e.g. to close its session */
  public static verifyIgnoringExpiration(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, Settings.getJWTSecret(), {ignoreExpiration: true}) as JwtPayload;
    } catch (e) {
      return null;
    }
  }
}

export default JWT;
