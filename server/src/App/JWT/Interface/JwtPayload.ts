

interface JwtPayload {
  username: string;
  /** stable id of server session, the same for refreshed tokens */
  sessionId: string;
  /** set by jsonwebtoken, seconds since epoch */
  iat?: number;
  exp?: number;
}

export default JwtPayload;
