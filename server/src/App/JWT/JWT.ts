import Settings from '../Settings/Settings';
import JwtPayload from './Interface/JwtPayload';

const jwt = require('jsonwebtoken');

class JWT {
  public static getJwtToken(payload: JwtPayload): string {
    const options = {
      expiresIn: Settings.getJWTTokenExpire(),
    }

    return jwt.sign(payload, Settings.getJWTSecret(), options);
  }

  /** returns payload of valid token, null for invalid or expired token */
  public static verify(token: string): JwtPayload | null {
    try {
      return jwt.verify(token, Settings.getJWTSecret()) as JwtPayload;
    } catch (e) {
      return null;
    }
  }
}

export default JWT;
