"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SUPPORTED_DSN = /^(mysql|mariadb|postgresql|postgres|pgsql):\/\/\S+$/i;
/** credentials must not be sent to browser */
const withoutCredentials = (dsn) => dsn.replace(/^([a-z]+:\/\/)[^@/]*@/i, '$1');
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'connection';
class PredefinedConnections {
    /** parsed once; invalid items are reported in log and skipped */
    static parse(env = process.env) {
        const allowCustom = !/^(false|0|no|off)$/i.test((env.FLASE_ALLOW_CUSTOM_CONNECTIONS || '').trim());
        const raw = (env.FLASE_CONNECTIONS || '').trim();
        if (!raw) {
            return { connections: [], allowCustom };
        }
        let items;
        try {
            const parsed = JSON.parse(raw);
            items = Array.isArray(parsed) ? parsed : [parsed];
        }
        catch (e) {
            console.error(`FLASE_CONNECTIONS is not valid JSON - no predefined connections (${(e === null || e === void 0 ? void 0 : e.message) || e})`);
            return { connections: [], allowCustom };
        }
        const connections = [];
        const ids = new Set();
        items.forEach((item, index) => {
            const config = typeof item === 'string' ? { dsn: item } : item;
            const dsn = typeof (config === null || config === void 0 ? void 0 : config.dsn) === 'string' ? config.dsn.trim() : '';
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
        return { connections, allowCustom };
    }
    static config() {
        if (!PredefinedConnections.loaded) {
            PredefinedConnections.loaded = PredefinedConnections.parse();
            const { connections, allowCustom } = PredefinedConnections.loaded;
            console.log(`Predefined connections: ${connections.length}, custom connections ${allowCustom ? 'allowed' : 'disabled'}`);
        }
        return PredefinedConnections.loaded;
    }
    static allowCustom() {
        return PredefinedConnections.config().allowCustom;
    }
    static find(id) {
        return typeof id === 'string' ? PredefinedConnections.config().connections.find((item) => item.id === id) || null : null;
    }
    /** for browser - DSN without credentials */
    static forClient() {
        return {
            allowCustomConnections: PredefinedConnections.allowCustom(),
            connections: PredefinedConnections.config().connections.map((item) => (Object.assign(Object.assign({}, item), { dsn: withoutCredentials(item.dsn), predefined: true }))),
        };
    }
}
PredefinedConnections.loaded = null;
exports.default = PredefinedConnections;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUHJlZGVmaW5lZENvbm5lY3Rpb25zLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9TZXR0aW5ncy9QcmVkZWZpbmVkQ29ubmVjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFzQkEsTUFBTSxhQUFhLEdBQUcsc0RBQXNELENBQUM7QUFFN0UsOENBQThDO0FBQzlDLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxHQUFXLEVBQVUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsd0JBQXdCLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFFaEcsTUFBTSxJQUFJLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRSxDQUFDLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLElBQUksWUFBWSxDQUFDO0FBRTlILE1BQU0scUJBQXFCO0lBR3pCLGlFQUFpRTtJQUNqRSxNQUFNLENBQUMsS0FBSyxDQUFDLE1BQXlCLE9BQU8sQ0FBQyxHQUFHO1FBQy9DLE1BQU0sV0FBVyxHQUFHLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLDhCQUE4QixJQUFJLEVBQUUsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLENBQUM7UUFDbkcsTUFBTSxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQWlCLElBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDakQsSUFBSSxDQUFDLEdBQUcsRUFBRTtZQUNSLE9BQU8sRUFBQyxXQUFXLEVBQUUsRUFBRSxFQUFFLFdBQVcsRUFBQyxDQUFDO1NBQ3ZDO1FBRUQsSUFBSSxLQUFZLENBQUM7UUFDakIsSUFBSTtZQUNGLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDL0IsS0FBSyxHQUFHLEtBQUss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