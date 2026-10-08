"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const uuid = require('uuid');
/** ticket is valid only for a short time and only once */
const TICKET_TTL_MS = 60 * 1000;
/**
 * One time tickets for HTTP download (dump) and upload (import).
 * File transfer does not go through websocket and token is never put into URL.
 * @author Mateusz Bochen
 */
class TransferRegistry {
    static create(ticket) {
        TransferRegistry.removeExpired();
        const id = uuid.v4();
        TransferRegistry.tickets.set(id, Object.assign(Object.assign({}, ticket), { expiresAt: Date.now() + TICKET_TTL_MS }));
        return id;
    }
    /** ticket is removed - it cannot be used again */
    static take(id) {
        const ticket = TransferRegistry.tickets.get(id);
        TransferRegistry.tickets.delete(id);
        return ticket && ticket.expiresAt > Date.now() ? ticket : null;
    }
    static removeExpired() {
        const now = Date.now();
        TransferRegistry.tickets.forEach((ticket, id) => ticket.expiresAt <= now && TransferRegistry.tickets.delete(id));
    }
}
TransferRegistry.tickets = new Map();
exports.default = TransferRegistry;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVHJhbnNmZXJSZWdpc3RyeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvVHJhbnNmZXIvVHJhbnNmZXJSZWdpc3RyeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUdBLE1BQU0sSUFBSSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUU3QiwwREFBMEQ7QUFDMUQsTUFBTSxhQUFhLEdBQUcsRUFBRSxHQUFHLElBQUksQ0FBQztBQVloQzs7OztHQUlHO0FBQ0gsTUFBTSxnQkFBZ0I7SUFHcEIsTUFBTSxDQUFDLE1BQU0sQ0FBQyxNQUE2QztRQUN6RCxnQkFBZ0IsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNqQyxNQUFNLEVBQUUsR0FBRyxJQUFJLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDckIsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLGtDQUFNLE1BQU0sS0FBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxHQUFHLGFBQWEsSUFBRSxDQUFDO1FBQ3JGLE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztJQUVELGtEQUFrRDtJQUNsRCxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQVU7UUFDcEIsTUFBTSxNQUFNLEdBQUcsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoRCxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3BDLE9BQU8sTUFBTSxJQUFJLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztJQUNqRSxDQUFDO0lBRU8sTUFBTSxDQUFDLGFBQWE7UUFDMUIsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLGdCQUFnQixDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLEdBQUcsSUFBSSxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDbkgsQ0FBQzs7QUFuQnVCLHdCQUFPLEdBQUcsSUFBSSxHQUFHLEVBQThCLENBQUM7QUFzQjFFLGtCQUFlLGdCQUFnQixDQUFDIn0=