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
}

export default JWT;
