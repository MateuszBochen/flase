import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import MessageType from '../WebSocket/Enum/MessageType';
import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import BaseRequest from '../API/Request/BaseRequest';
import {ImportFinishedInterface, TransferRequestType} from './TransferInterface';

/**
 * Dump download and import upload. File goes over HTTP (streamed by server),
 * the one time ticket for it is requested over websocket of the connection.
 */
class TransferApi {
  /** one time ticket valid for one minute */
  static requestTicket(connection: ConnectionDataInterface, tabId: string, transfer: TransferRequestType): Promise<string> {
    return new Promise((resolve, reject) => {
      const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
        const message = event.getData();
        if (message.payload?.tabId !== tabId) return;
        if (message.message === MessageType.TRANSFER_TICKET) {
          EventBus.unSub(eventId);
          resolve(message.payload.ticket);
        } else if (message.message === MessageType.QUERY_ERROR) {
          EventBus.unSub(eventId);
          reject(new Error(message.payload.error));
        }
      });

      try {
        const manager = ConnectionManager.getInstance();
        const established = manager.getEstablishedConnection(connection);
        manager.getClientForConnection(established).sendCommand({
          connectionData: established,
          command: CommandType.CREATE_TRANSFER,
          payload: {tabId, transfer},
        });
      } catch (e) {
        EventBus.unSub(eventId);
        reject(e);
      }
    });
  }

  /** browser downloads the dump itself - nothing is kept in memory */
  static download(ticket: string): void {
    const link = document.createElement('a');
    link.href = `${BaseRequest.API_URL}/api/transfer/${ticket}`;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /**
   * dump as text for showing in page - reading stops after maxBytes (browser would not show huge text),
   * the rest of dump is cancelled on server
   */
  static async fetchText(ticket: string, maxBytes: number): Promise<{text: string, truncated: boolean}> {
    const response = await fetch(`${BaseRequest.API_URL}/api/transfer/${ticket}`);
    if (!response.ok || !response.body) {
      throw new Error(await response.text() || `Export failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let bytes = 0;
    for (;;) {
      const {done, value} = await reader.read();
      if (done) {
        return {text: text + decoder.decode(), truncated: false};
      }
      bytes += value.length;
      text += decoder.decode(value, {stream: true});
      if (bytes >= maxBytes) {
        await reader.cancel();
        return {text, truncated: true};
      }
    }
  }

  /**
   * file is sent as request body, onUpload reports sent bytes (server progress comes over websocket).
   * Server answers when the file is uploaded (202) - big import runs longer than proxies keep requests open,
   * its result is IMPORT_FINISHED of the tab over websocket. Error before the upload ended is the answer itself.
   */
  static upload(ticket: string, tabId: string, file: Blob, onUpload: (sent: number, total: number) => void): Promise<ImportFinishedInterface> {
    return new Promise((resolve, reject) => {
      // subscribed before upload - short import can finish before the answer arrives
      const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
        const message = event.getData();
        if (message.payload?.tabId === tabId && message.message === MessageType.IMPORT_FINISHED) {
          done();
          resolve(message.payload);
        }
      });
      const done = () => EventBus.unSub(eventId);

      const request = new XMLHttpRequest();
      request.open('POST', `${BaseRequest.API_URL}/api/transfer/${ticket}`);
      request.setRequestHeader('Content-Type', 'application/octet-stream');
      request.upload.onprogress = (event) => onUpload(event.loaded, event.total || file.size);
      request.onload = () => {
        let body: any = null;
        try {
          body = JSON.parse(request.responseText);
        } catch (e) {
          // answer of proxy (HTML page) - status says enough
        }
        if (request.status === 202) {
          onUpload(file.size, file.size);
          return;
        }
        done();
        request.status === 200 && body ? resolve(body) : reject(new Error(body?.error || `Import failed (${request.status})`));
      };
      request.onerror = () => {
        done();
        reject(new Error('Connection to server was lost during upload'));
      };
      request.send(file);
    });
  }
}

export default TransferApi;
