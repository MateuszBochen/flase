/**
 * Passwords of connections remembered only in this browser (option "Remember password").
 *
 * - encrypted by AES-GCM (Web Crypto) with a key generated in browser as NOT extractable - code of the page can use
 *   the key, but cannot read it, so the key cannot be copied out like a value of localStorage
 * - key and encrypted passwords are in IndexedDB of this site, nothing is sent anywhere (server gets the password
 *   only for login, as when it is typed)
 * - ciphertext is bound to id of connection (additional data of AES-GCM) - it cannot be moved to other connection
 * - Web Crypto is available only in secure context (HTTPS or localhost), otherwise passwords are not remembered
 *
 * It protects against reading of stored data (copied storage, synced profile, other site), not against someone
 * who uses the unlocked browser or malware on the computer.
 */
import {SshSecretsInterface} from './Ssh/SshTunnelInterface';

const DB_NAME = 'flase-vault';
const KEYS = 'keys';
const SECRETS = 'secrets';
const KEY_ID = 'main';

export interface SavedCredentialsInterface {
  username: string;
  password: string;
  /** password / private key of SSH tunnel */
  ssh?: SshSecretsInterface;
}

type SecretRecordType = {iv: Uint8Array, data: ArrayBuffer};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

let database: Promise<IDBDatabase> | null = null;
let key: Promise<CryptoKey> | null = null;

const request = <T>(operation: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error);
});

const openDatabase = (): Promise<IDBDatabase> => {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const opening = indexedDB.open(DB_NAME, 1);
      opening.onupgradeneeded = () => {
        opening.result.createObjectStore(KEYS);
        opening.result.createObjectStore(SECRETS);
      };
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    database.catch(() => {
      database = null;
    });
  }
  return database;
};

const store = async (name: string, mode: IDBTransactionMode): Promise<IDBObjectStore> => (await openDatabase()).transaction(name, mode).objectStore(name);

/** the same key for all passwords; generated once, never readable */
const getKey = (): Promise<CryptoKey> => {
  if (!key) {
    key = (async () => {
      const existing = await request<CryptoKey | undefined>((await store(KEYS, 'readonly')).get(KEY_ID));
      if (existing) {
        return existing;
      }
      const generated = await crypto.subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
      await request((await store(KEYS, 'readwrite')).put(generated, KEY_ID));
      return generated;
    })();
    key.catch(() => {
      key = null;
    });
  }
  return key;
};

const PasswordVault = {
  /** secure context (HTTPS / localhost) with Web Crypto and IndexedDB */
  isAvailable: (): boolean => typeof window !== 'undefined' && window.isSecureContext && !!window.crypto?.subtle && typeof indexedDB !== 'undefined',

  save: async (connectionId: string, credentials: SavedCredentialsInterface): Promise<void> => {
    if (!PasswordVault.isAvailable()) return;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      {name: 'AES-GCM', iv, additionalData: encoder.encode(connectionId)},
      await getKey(),
      encoder.encode(JSON.stringify(credentials)),
    );
    await request((await store(SECRETS, 'readwrite')).put({iv, data} as SecretRecordType, connectionId));
  },

  load: async (connectionId: string): Promise<SavedCredentialsInterface | null> => {
    if (!PasswordVault.isAvailable()) return null;
    try {
      const record = await request<SecretRecordType | undefined>((await store(SECRETS, 'readonly')).get(connectionId));
      if (!record) return null;
      const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: record.iv, additionalData: encoder.encode(connectionId)}, await getKey(), record.data);
      const credentials = JSON.parse(decoder.decode(plain));
      return typeof credentials?.password === 'string' ? credentials : null;
    } catch (e) {
      // other key (storage of site was partly cleared) or damaged record - forgotten
      await PasswordVault.remove(connectionId).catch(() => undefined);
      return null;
    }
  },

  has: async (connectionId: string): Promise<boolean> => {
    if (!PasswordVault.isAvailable()) return false;
    try {
      return (await request<number>((await store(SECRETS, 'readonly')).count(connectionId))) > 0;
    } catch (e) {
      return false;
    }
  },

  remove: async (connectionId: string): Promise<void> => {
    if (!PasswordVault.isAvailable()) return;
    await request((await store(SECRETS, 'readwrite')).delete(connectionId));
  },
};

export default PasswordVault;
