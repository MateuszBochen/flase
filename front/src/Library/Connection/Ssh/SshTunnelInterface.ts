/**
 * SSH tunnel of connection - Flase server logs in to SSH server (bastion) and reaches the database from there;
 * host of DSN is then the address as seen from SSH server (often 127.0.0.1)
 */
export type SshAuthType = 'password' | 'key' | 'keyFile';

/** saved with connection (no secrets) */
export interface SshConfigInterface {
  host: string;
  port?: number;
  username: string;
  /** which secret is asked when connecting: password, private key (pasted / file of this computer) or key file of server */
  auth: SshAuthType;
  /** SHA256:... fingerprint of host key confirmed by user */
  hostKey?: string;
  /** private key file in directory of Flase server (FLASE_SSH_KEY_DIR) */
  keyFile?: string;
}

/** sent with login only, remembered only encrypted in browser (Remember password) */
export interface SshSecretsInterface {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

/** login was refused - host key of SSH server is not the confirmed one */
export interface SshHostKeyInterface {
  fingerprint: string;
  changed: boolean;
}

export const sshAddress = (ssh: SshConfigInterface): string => `${ssh.username}@${ssh.host}${ssh.port && ssh.port !== 22 ? `:${ssh.port}` : ''}`;

/** secrets needed by the way of login, empty ones left out */
export const sshSecretsOf = (auth: SshAuthType, secrets: SshSecretsInterface): SshSecretsInterface => {
  const result: SshSecretsInterface = {};
  if (auth === 'password' && secrets.password) result.password = secrets.password;
  if (auth === 'key' && secrets.privateKey?.trim()) result.privateKey = secrets.privateKey;
  if (auth !== 'password' && secrets.passphrase) result.passphrase = secrets.passphrase;
  return result;
};
