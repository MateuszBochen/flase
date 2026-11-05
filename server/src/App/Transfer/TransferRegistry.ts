import DriverInterface from '../Driver/DriverInterface';
import {TransferRequestType} from '../Driver/Interface/Data/TransferInterface';
import MessageType from '../Websocket/Enum/MessageType';
const uuid = require('uuid');

/** ticket is valid only for a short time and only once */
const TICKET_TTL_MS = 60 * 1000;

export type TransferTicketType = {
  request: TransferRequestType;
  driver: DriverInterface;
  /** tab of client - progress messages and cancel use it */
  tabId: string;
  /** message to websocket of the client which created the ticket */
  notify: (message: MessageType, payload: any) => void;
  expiresAt: number;
};

/**
 * One time tickets for HTTP download (dump) and upload (import).
 * File transfer does not go through websocket and token is never put into URL.
 * @author Mateusz Bochen
 */
class TransferRegistry {
  private static readonly tickets = new Map<string, TransferTicketType>();
  private static readonly running = new Map<string, {driver: DriverInterface, cancel: () => void}>();

  static create(ticket: Omit<TransferTicketType, 'expiresAt'>): string {
    TransferRegistry.removeExpired();
    const id = uuid.v4();
    TransferRegistry.tickets.set(id, {...ticket, expiresAt: Date.now() + TICKET_TTL_MS});
    return id;
  }

  /** ticket is removed - it cannot be used again */
  static take(id: string): TransferTicketType | null {
    const ticket = TransferRegistry.tickets.get(id);
    TransferRegistry.tickets.delete(id);
    return ticket && ticket.expiresAt > Date.now() ? ticket : null;
  }

  /** dump which is being downloaded / import which is running - Cancel of the tab stops it */
  static started(tabId: string, driver: DriverInterface, cancel: () => void): void {
    TransferRegistry.running.set(tabId, {driver, cancel});
  }

  static finished(tabId: string, cancel: () => void): void {
    if (TransferRegistry.running.get(tabId)?.cancel === cancel) {
      TransferRegistry.running.delete(tabId);
    }
  }

  /** dump or import of the driver is running - its session must keep the database connection (closed tab, expired token) */
  static isRunning(driver: DriverInterface): boolean {
    for (const running of TransferRegistry.running.values()) {
      if (running.driver === driver) return true;
    }
    return false;
  }

  /** only session which started the dump can stop it - tab ids are chosen by browser */
  static cancel(tabId: string, driver: DriverInterface): boolean {
    const running = TransferRegistry.running.get(tabId);
    if (!running || running.driver !== driver) return false;
    running.cancel();
    return true;
  }

  private static removeExpired(): void {
    const now = Date.now();
    TransferRegistry.tickets.forEach((ticket, id) => ticket.expiresAt <= now && TransferRegistry.tickets.delete(id));
  }
}

export default TransferRegistry;
