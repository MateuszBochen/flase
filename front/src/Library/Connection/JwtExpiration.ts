
/** reads times from token payload, signature is checked by server */
class JwtExpiration {
  /** expiration and issue time in ms, null for token which cannot be read */
  static read(token: string): {issuedAt: number, expiresAt: number} | null {
    try {
      const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      if (typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
        return null;
      }
      return {issuedAt: payload.iat * 1000, expiresAt: payload.exp * 1000};
    } catch (e) {
      return null;
    }
  }

  /**
   * when token should be refreshed - 20% of its lifetime before expiration,
   * at least 10 seconds and at most 5 minutes before
   */
  static refreshAt(token: string): number | null {
    const times = JwtExpiration.read(token);
    if (!times) {
      return null;
    }
    const margin = Math.min(5 * 60 * 1000, Math.max(10 * 1000, (times.expiresAt - times.issuedAt) * 0.2));
    return times.expiresAt - margin;
  }
}

export default JwtExpiration;
