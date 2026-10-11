import Settings from '../../Settings/Settings';
const fs = require('fs');
const path = require('path');

/**
 * TLS (SSL) of database connection from query of DSN, e.g. postgresql://db:5432/shop?sslmode=verify-full&sslrootcert=ca.pem
 *
 * sslmode (also ssl-mode / ssl_mode, MySQL values and ssl=true):
 *   disable     - no TLS (default)
 *   require     - encrypted, certificate of server is not checked (REQUIRED)
 *   verify-ca   - certificate must be signed by trusted CA (VERIFY_CA)
 *   verify-full - verify-ca and host name of DSN must match certificate (VERIFY_IDENTITY)
 * sslrootcert (ssl-ca) - CA of server, sslcert (ssl-cert) + sslkey (ssl-key) - certificate of client
 *
 * Files are read only from FLASE_CERT_DIR - DSN typed in browser cannot read other files of server.
 * Without sslrootcert the trusted CAs of Node.js are used (public CAs of cloud databases).
 */
export type TlsModeType = 'disable' | 'require' | 'verify-ca' | 'verify-full';

export interface DsnTlsInterface {
  mode: TlsModeType;
  ca?: Buffer;
  cert?: Buffer;
  key?: Buffer;
}

const MODES: {[value: string]: TlsModeType} = {
  'disable': 'disable', 'disabled': 'disable', 'false': 'disable', '0': 'disable', 'off': 'disable', 'no': 'disable',
  'require': 'require', 'required': 'require', 'true': 'require', '1': 'require', 'on': 'require', 'yes': 'require',
  'verify-ca': 'verify-ca', 'verify_ca': 'verify-ca',
  'verify-full': 'verify-full', 'verify_full': 'verify-full', 'verify-identity': 'verify-full', 'verify_identity': 'verify-full',
};

/** value of first present key, keys are compared case insensitive */
const param = (params: Record<string, unknown>, names: string[]): string | undefined => {
  const entry = Object.entries(params).find(([key]) => names.includes(key.toLowerCase()));
  return entry && entry[1] !== undefined && entry[1] !== null ? String(entry[1]).trim() : undefined;
};

/** file inside FLASE_CERT_DIR, never outside of it */
const readCertificate = (name: string, kind: string): Buffer => {
  const directory = path.resolve(Settings.getCertDirectory());
  const file = path.resolve(directory, name);
  if (file !== directory && !file.startsWith(directory + path.sep)) {
    throw new Error(`${kind} must be a file in certificate directory of Flase server (FLASE_CERT_DIR)`);
  }
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw new Error(`${kind} ${name} was not found in certificate directory of Flase server (FLASE_CERT_DIR)`);
  }
};

export const tlsOfDsn = (params: Record<string, unknown> = {}): DsnTlsInterface => {
  const rawMode = param(params, ['sslmode', 'ssl-mode', 'ssl_mode', 'ssl']);
  const caName = param(params, ['sslrootcert', 'ssl-ca', 'ssl_ca', 'sslca']);
  const certName = param(params, ['sslcert', 'ssl-cert', 'ssl_cert']);
  const keyName = param(params, ['sslkey', 'ssl-key', 'ssl_key']);

  let mode: TlsModeType = 'disable';
  if (rawMode !== undefined && rawMode !== '') {
    const known = MODES[rawMode.toLowerCase()];
    if (!known) {
      if (/^prefer(red)?$/i.test(rawMode)) {
        throw new Error('sslmode=prefer is not supported - use sslmode=require (encrypted) or sslmode=disable');
      }
      throw new Error(`Unknown sslmode ${rawMode} - use disable, require, verify-ca or verify-full`);
    }
    mode = known;
  }
  // like libpq: CA given with require means the certificate is verified
  if (mode === 'require' && caName) {
    mode = 'verify-ca';
  }
  if (mode === 'disable') {
    return {mode};
  }
  if (!!certName !== !!keyName) {
    throw new Error('Certificate of client needs both sslcert and sslkey');
  }
  return {
    mode,
    ca: caName ? readCertificate(caName, 'CA certificate (sslrootcert)') : undefined,
    cert: certName ? readCertificate(certName, 'Client certificate (sslcert)') : undefined,
    key: keyName ? readCertificate(keyName, 'Client key (sslkey)') : undefined,
  };
};

/** options of tls.connect / TLSSocket for the mode */
export const nodeTlsOptions = (tls: DsnTlsInterface): {[key: string]: any} | undefined => {
  if (tls.mode === 'disable') {
    return undefined;
  }
  return {
    rejectUnauthorized: tls.mode !== 'require',
    ...(tls.ca ? {ca: tls.ca} : {}),
    ...(tls.cert ? {cert: tls.cert, key: tls.key} : {}),
    // verify-ca: chain is checked, host name is not
    ...(tls.mode === 'verify-ca' ? {checkServerIdentity: () => undefined} : {}),
  };
};
