import {Client, ClientChannel, ConnectConfig} from 'ssh2';
import Settings from '../../Settings/Settings';
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * SSH tunnel of database connection - database reachable only from other machine (bastion, jump host).
 *
 * Flase server logs in to SSH server and listens on a random port of 127.0.0.1. Every connection of database pool made
 * to this port is forwarded through SSH (direct-tcpip channel) to host and port of DSN, as seen from SSH server -
 * drivers, TLS of database and everything else work as without tunnel.
 *
 * Host key of SSH server must be known (SHA256 fingerprint as shown by ssh-keygen -lf) - unknown key is reported with
 * its fingerprint so user can confirm it, changed key is refused (someone may be in the middle).
 * SSH connection is closed with database connections of idle session and opened again by the next query.
 */

/** settings of tunnel, saved with connection */
export interface SshConfigInterface {
  host: string;
  port?: number;
  username: string;
  /** SHA256:... fingerprint of host key, confirmed by user (or administrator) */
  hostKey?: string;
  /** private key file in FLASE_SSH_KEY_DIR */
  keyFile?: string;
}

/** secrets of tunnel - sent with login like password of database, never saved on server */
export interface SshSecretsInterface {
  password?: string;
  /** private key in OpenSSH / PEM format */
  privateKey?: string;
  passphrase?: string;
}

/** host key of SSH server is not the confirmed one */
export class SshHostKeyError extends Error {
  readonly fingerprint: string;
  readonly changed: boolean;

  constructor(host: string, fingerprint: string, changed: boolean) {
    super(changed
      ? `Host key of SSH server ${host} has changed (${fingerprint}) - connection refused, someone may be intercepting it. Confirm the new key only when you know why it changed`
      : `Host key of SSH server ${host} is not known yet: ${fingerprint}`);
    this.fingerprint = fingerprint;
    this.changed = changed;
  }
}

/** SHA256 fingerprint as OpenSSH prints it */
export const fingerprintOf = (key: Buffer): string => `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;

const sameFingerprint = (a: string, b: string): boolean => a.trim().replace(/=+$/, '') === b.trim().replace(/=+$/, '');

/** file inside FLASE_SSH_KEY_DIR, never outside of it */
const readKeyFile = (name: string): Buffer => {
  const directory = path.resolve(Settings.getSshKeyDirectory());
  const file = path.resolve(directory, name);
  if (file === directory || !file.startsWith(directory + path.sep)) {
    throw new Error('SSH key must be a file in SSH key directory of Flase server (FLASE_SSH_KEY_DIR)');
  }
  try {
    return fs.readFileSync(file);
  } catch (e) {
    throw new Error(`SSH key ${name} was not found in SSH key directory of Flase server (FLASE_SSH_KEY_DIR)`);
  }
};

/** errors of ssh2 say little to user */
const explain = (error: any, config: SshConfigInterface): Error => {
  if (error instanceof SshHostKeyError) return error;
  const address = `${config.username}@${config.host}:${config.port || 22}`;
  const message = String(error?.message || error);
  if (error?.level === 'client-authentication' || /authentication methods failed/i.test(message)) {
    return new Error(`SSH login to ${address} failed - check user, password or private key`);
  }
  if (/timed out while waiting for handshake/i.test(message) || error?.code === 'ETIMEDOUT') {
    return new Error(`SSH server ${config.host}:${config.port || 22} did not respond in ${Math.round(Settings.getConnectTimeoutMs() / 1000)} s - check host, port and firewall`);
  }
  if (error?.code === 'ECONNREFUSED') {
    return new Error(`Connection refused - SSH server does not listen on ${config.host}:${config.port || 22}`);
  }
  if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
    return new Error(`SSH server ${config.host} was not found (DNS)`);
  }
  // own messages (key file) are clear already
  if (/^SSH /.test(message)) {
    return error instanceof Error ? error : new Error(message);
  }
  if (/privateKey|private key|passphrase/i.test(message)) {
    return new Error(`SSH private key: ${message}`);
  }
  return new Error(`SSH ${address}: ${message}`);
};

class SshTunnel {
  private readonly config: SshConfigInterface;
  private readonly secrets: SshSecretsInterface;
  private readonly target: {host: string, port: number};
  private server: any = null;
  private localPort = 0;
  /** SSH connection - null when closed, opened again by next database connection */
  private client: Promise<Client> | null = null;
  private closed = false;

  constructor(config: SshConfigInterface, secrets: SshSecretsInterface, target: {host: string, port: number}) {
    this.config = config;
    this.secrets = secrets || {};
    this.target = target;
  }

  /** valid shape of tunnel settings and secrets from browser, otherwise description of the problem */
  static validate(config: any, secrets: any): string | null {
    if (config === undefined || config === null) return null;
    if (typeof config !== 'object') return 'connectionData.ssh must be an object';
    if (typeof config.host !== 'string' || !config.host.trim() || config.host.length > 255) return 'SSH host is required';
    if (config.port !== undefined && (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535)) return 'SSH port must be 1 - 65535';
    if (typeof config.username !== 'string' || !config.username.trim() || config.username.length > 255) return 'SSH user is required';
    for (const key of ['hostKey', 'keyFile']) {
      if (config[key] !== undefined && config[key] !== null && (typeof config[key] !== 'string' || config[key].length > 1024)) return `SSH ${key} must be text`;
    }
    if (secrets !== undefined && secrets !== null) {
      if (typeof secrets !== 'object') return 'userData.ssh must be an object';
      for (const key of ['password', 'privateKey', 'passphrase']) {
        if (secrets[key] !== undefined && secrets[key] !== null && (typeof secrets[key] !== 'string' || secrets[key].length > 65536)) return `SSH ${key} must be text`;
      }
    }
    return null;
  }

  /**
   * tunnel of connection or null without SSH; SSH login and route to database are checked - errors are clear here,
   * later the driver would see only closed socket
   */
  static async open(config: SshConfigInterface | undefined | null, secrets: SshSecretsInterface | undefined, target: {host: string, port: number}): Promise<SshTunnel | null> {
    if (!config) return null;
    const tunnel = new SshTunnel(config, secrets || {}, target);
    try {
      await tunnel.start();
      return tunnel;
    } catch (e) {
      tunnel.close();
      throw e;
    }
  }

  /** where the driver connects instead of host of DSN */
  address(): {host: string, port: number} {
    return {host: '127.0.0.1', port: this.localPort};
  }

  /** SSH connection is closed (idle session), next database connection opens it again */
  release(): void {
    const client = this.client;
    this.client = null;
    client?.then((connected) => connected.end()).catch(() => undefined);
  }

  close(): void {
    this.closed = true;
    this.release();
    this.server?.close();
    this.server = null;
  }

  private async start(): Promise<void> {
    const client = await this.connectedClient();
    // database must be reachable from SSH server
    const channel = await this.forward(client, 0).catch((e: any) => {
      throw new Error(`SSH server ${this.config.host} could not connect to database ${this.target.host}:${this.target.port} (${e?.message || e})`);
    });
    channel.close();
    this.server = net.createServer((socket: any) => this.onSocket(socket));
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(0, '127.0.0.1', () => {
        this.localPort = this.server.address().port;
        resolve();
      });
    });
    this.server.on('error', (e: any) => console.log('SSH tunnel listener error', e?.message || e));
  }

  /** connection of database pool - piped through new channel of SSH connection */
  private onSocket(socket: any): void {
    socket.on('error', () => undefined);
    socket.pause();
    this.connectedClient()
      .then((client) => this.forward(client, socket.remotePort || 0))
      .then((channel) => {
        channel.on('error', () => socket.destroy());
        socket.pipe(channel).pipe(socket);
        socket.resume();
      })
      .catch((e: any) => {
        console.log('SSH tunnel', e?.message || e);
        socket.destroy();
      });
  }

  private forward(client: Client, sourcePort: number): Promise<ClientChannel> {
    return new Promise((resolve, reject) => {
      client.forwardOut('127.0.0.1', sourcePort, this.target.host, this.target.port, (err, channel) => err ? reject(err) : resolve(channel));
    });
  }

  private connectedClient(): Promise<Client> {
    if (this.closed) return Promise.reject(new Error('SSH tunnel is closed'));
    if (!this.client) {
      const opening = this.connect();
      this.client = opening;
      // failed login is tried again by next connection
      opening.catch(() => {
        if (this.client === opening) this.client = null;
      });
    }
    return this.client;
  }

  private connect(): Promise<Client> {
    const config = this.config;
    return new Promise<Client>((resolve, reject) => {
      const client = new Client();
      let hostKeyError: SshHostKeyError | null = null;
      let ready = false;
      const options: ConnectConfig = {
        host: config.host.trim(),
        port: config.port || 22,
        username: config.username,
        readyTimeout: Settings.getConnectTimeoutMs(),
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
        hostVerifier: (key: Buffer) => {
          const fingerprint = fingerprintOf(key);
          if (config.hostKey && sameFingerprint(config.hostKey, fingerprint)) return true;
          hostKeyError = new SshHostKeyError(config.host, fingerprint, !!config.hostKey);
          return false;
        },
      };
      try {
        const privateKey = this.secrets.privateKey?.trim() ? this.secrets.privateKey : config.keyFile ? readKeyFile(config.keyFile) : undefined;
        if (privateKey) {
          options.privateKey = privateKey;
          if (this.secrets.passphrase) options.passphrase = this.secrets.passphrase;
        }
        if (this.secrets.password) {
          options.password = this.secrets.password;
          // servers with password only as keyboard-interactive
          options.tryKeyboard = true;
        }
      } catch (e) {
        reject(explain(e, config));
        return;
      }
      client.on('keyboard-interactive', (name, instructions, lang, prompts, finish) => finish(prompts.map(() => this.secrets.password || '')));
      client.on('ready', () => {
        ready = true;
        resolve(client);
      });
      client.on('error', (e) => {
        if (!ready) reject(explain(hostKeyError || e, config));
        else console.log(`SSH tunnel ${config.host}`, e?.message || e);
      });
      client.on('close', () => {
        if (!ready) reject(explain(hostKeyError || new Error('SSH connection was closed'), config));
        // lost connection - next database connection opens a new one
        if (this.client) {
          this.client.then((current) => current === client && (this.client = null)).catch(() => undefined);
        }
      });
      try {
        client.connect(options);
      } catch (e) {
        // e.g. private key which cannot be parsed
        reject(explain(e, config));
      }
    });
  }
}

export default SshTunnel;
