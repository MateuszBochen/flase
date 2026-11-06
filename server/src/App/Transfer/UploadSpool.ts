import {Readable} from 'stream';
import {IncomingMessage} from 'http';
import {promises as fs} from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';

const READ_BYTES = 256 * 1024;

/**
 * Uploaded file goes to temporary file at speed of network, import reads it at speed of database.
 * Upload is never held up by a long statement (proxy and Node close requests whose body stalls - 408),
 * the request ends when the file is uploaded, not when it is imported.
 * File is deleted right after it is opened - it disappears with the handle, also when server stops.
 * @author Mateusz Bochen
 */
class UploadSpool {
  private written = 0;
  /** bytes of the file read by import - progress of import, compressed bytes for gzip */
  private position = 0;
  private uploaded = false;
  private error: Error | null = null;
  /** import does not need the rest of upload - it is read and thrown away */
  private discarded = false;
  private closed = false;
  private wake: (() => void) | null = null;
  /** resolves when the whole body was received, rejects when upload was interrupted */
  readonly upload: Promise<number>;

  private constructor(private readonly file: fs.FileHandle, request: IncomingMessage) {
    this.upload = this.receive(request);
    // the rejection is reported to the reader - waiting for upload is optional
    this.upload.catch(() => undefined);
  }

  static async create(request: IncomingMessage): Promise<UploadSpool> {
    const name = path.join(process.env.FLASE_UPLOAD_DIR || os.tmpdir(), `flase-upload-${crypto.randomBytes(12).toString('hex')}`);
    const file = await fs.open(name, 'w+', 0o600);
    await fs.unlink(name).catch(() => undefined);
    return new UploadSpool(file, request);
  }

  /** bytes of upload in order, waits for bytes not uploaded yet; fails when upload was interrupted */
  stream(): Readable {
    const stream = Readable.from(this.read(), {objectMode: false});
    // reader gets the error from iteration - without listener interrupted upload would stop the whole server
    stream.on('error', () => undefined);
    return stream;
  }

  /** import ended - rest of upload is not stored, file is closed when the upload ends */
  discard(): void {
    this.discarded = true;
    this.notify();
    if (this.uploaded || this.error) this.close();
  }

  get readBytes(): number {
    return this.position;
  }

  private async* read(): AsyncGenerator<Buffer> {
    for (;;) {
      if (this.discarded) {
        return;
      }
      if (this.position < this.written) {
        const buffer = Buffer.alloc(Math.min(READ_BYTES, this.written - this.position));
        const {bytesRead} = await this.file.read(buffer, 0, buffer.length, this.position);
        this.position += bytesRead;
        yield buffer.subarray(0, bytesRead);
      } else if (this.error) {
        throw this.error;
      } else if (this.uploaded) {
        return;
      } else {
        await new Promise<void>((resolve) => { this.wake = resolve; });
      }
    }
  }

  private async receive(request: IncomingMessage): Promise<number> {
    let bytes = 0;
    try {
      for await (const chunk of request) {
        bytes += chunk.length;
        if (!this.discarded) {
          await this.file.write(chunk, 0, chunk.length, this.written);
          this.written += chunk.length;
          this.notify();
        }
      }
      if (!request.complete) {
        throw new Error('Upload was interrupted');
      }
      this.uploaded = true;
      return bytes;
    } catch (e: any) {
      this.error = new Error(`Upload was interrupted: ${e?.message || e}`);
      throw this.error;
    } finally {
      this.notify();
      if (this.discarded) this.close();
    }
  }

  private notify(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  private close(): void {
    if (this.closed) return;
    this.closed = true;
    this.file.close().catch(() => undefined);
  }
}

export default UploadSpool;
