/**
 * Connections defined by administrator in environment - e.g. database is reachable only from server of Flase.
 *
 * FLASE_CONNECTIONS - JSON array, item is DSN or object:
 *   ["mysql://db-prod:3306", {"name": "Shop", "dsn": "postgresql://db:5432/shop", "username": "app", "readOnly": true,
 *    "color": "#d9534f", "confirmChanges": true}]
 * FLASE_ALLOW_CUSTOM_CONNECTIONS - false = users can use only connections above (default true)
 *
 * Server is the source of truth: login to predefined connection uses DSN from here (not the one sent by browser)
 * and readOnly from here is enforced for the whole session.
 */
export interface PredefinedConnectionInterface {
  id: string;
  displayName: string;
  dsn: string;
  /** default user, user can log in as other one */
  username: string;
  readOnly: boolean;
  color?: string;
  changeConfirmationRequired: boolean;
}

const SUPPORTED_DSN = /^(mysql|mariadb|postgresql|postgres|pgsql):\/\/\S+$/i;

/** credentials must not be sent to browser */
const withoutCredentials = (dsn: string): string => dsn.replace(/^([a-z]+:\/\/)[^@/]*@/i, '$1');

const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';

class PredefinedConnections {
  private static loaded: {connections: PredefinedConnectionInterface[], allowCustom: boolean} | null = null;

  /** parsed once; invalid items are reported in log and skipped */
  static parse(env: NodeJS.ProcessEnv = process.env): {connections: PredefinedConnectionInterface[], allowCustom: boolean} {
    const allowCustom = !/^(false|0|no|off)$/i.test((env.FLASE_ALLOW_CUSTOM_CONNECTIONS || '').trim());
    const raw = (env.FLASE_CONNECTIONS || '').trim();
    if (!raw) {
      return {connections: [], allowCustom};
    }

    let items: any[];
    try {
      const parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [parsed];
    } catch (e: any) {
      console.error(`FLASE_CONNECTIONS is not valid JSON - no predefined connections (${e?.message || e})`);
      return {connections: [], allowCustom};
    }

    const connections: PredefinedConnectionInterface[] = [];
    const ids = new Set<string>();
    items.forEach((item, index) => {
      const config = typeof item === 'string' ? {dsn: item} : item;
      const dsn = typeof config?.dsn === 'string' ? config.dsn.trim() : '';
      if (!SUPPORTED_DSN.test(dsn)) {
        console.error(`FLASE_CONNECTIONS[${index}] skipped - expected mysql://, mariadb:// or postgresql:// DSN`);
        return;
      }
      const displayName = typeof config.name === 'string' && config.name.trim() ? config.name.trim() : withoutCredentials(dsn);
      let id = `env:${slug(typeof config.id === 'string' && config.id.trim() ? config.id : displayName)}`;
      for (let suffix = 2; ids.has(id); suffix++) {
        id = `env:${slug(displayName)}-${suffix}`;
      }
      ids.add(id);
      connections.push({
        id,
        displayName,
        dsn,
        username: typeof config.username === 'string' ? config.username : '',
        readOnly: config.readOnly === true,
        color: typeof config.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(config.color) ? config.color : undefined,
        changeConfirmationRequired: config.confirmChanges === true,
      });
    });

    if (!allowCustom && !connections.length) {
      console.error('FLASE_ALLOW_CUSTOM_CONNECTIONS is false and there is no valid predefined connection - nobody can log in');
    }
    return {connections, allowCustom};
  }

  private static config() {
    if (!PredefinedConnections.loaded) {
      PredefinedConnections.loaded = PredefinedConnections.parse();
      const {connections, allowCustom} = PredefinedConnections.loaded;
      console.log(`Predefined connections: ${connections.length}, custom connections ${allowCustom ? 'allowed' : 'disabled'}`);
    }
    return PredefinedConnections.loaded;
  }

  static allowCustom(): boolean {
    return PredefinedConnections.config().allowCustom;
  }

  static find(id: unknown): PredefinedConnectionInterface | null {
    return typeof id === 'string' ? PredefinedConnections.config().connections.find((item) => item.id === id) || null : null;
  }

  /** for browser - DSN without credentials */
  static forClient() {
    return {
      allowCustomConnections: PredefinedConnections.allowCustom(),
      connections: PredefinedConnections.config().connections.map((item) => ({...item, dsn: withoutCredentials(item.dsn), predefined: true})),
    };
  }
}

export default PredefinedConnections;
