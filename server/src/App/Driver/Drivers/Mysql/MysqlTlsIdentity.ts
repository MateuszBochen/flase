const tls = require('tls');

/**
 * Package `mysql` (2.18.1, last version) checks only chain of certificate of server, not its host name.
 * For sslmode=verify-full (VERIFY_IDENTITY) TLS of connection is started by copy of its _startTLS
 * with host name check (tls.checkServerIdentity) added. Other modes use the original function.
 * config.ssl.verifyIdentity = host name expected in certificate.
 */
let installed = false;

export const installMysqlTlsIdentityCheck = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  const Connection = require('mysql/lib/Connection');
  const original = Connection.prototype._startTLS;

  Connection.prototype._startTLS = function _startTLS(onSecure: (error?: Error | null) => void) {
    const connection = this;
    const expectedHost: string | undefined = connection.config.ssl?.verifyIdentity;
    if (!expectedHost || !tls.TLSSocket) {
      return original.call(this, onSecure);
    }

    let secureContext;
    try {
      secureContext = tls.createSecureContext({
        ca: connection.config.ssl.ca,
        cert: connection.config.ssl.cert,
        ciphers: connection.config.ssl.ciphers,
        key: connection.config.ssl.key,
        passphrase: connection.config.ssl.passphrase,
      });
    } catch (error: any) {
      onSecure(error);
      return;
    }

    // the same as original: unpipe, socket <-> encrypted, cleartext <-> protocol
    connection._socket.removeAllListeners('data');
    connection._protocol.removeAllListeners('data');
    let secureEstablished = false;
    const secureSocket = new tls.TLSSocket(connection._socket, {
      rejectUnauthorized: true,
      requestCert: true,
      secureContext,
      isServer: false,
    });

    secureSocket.on('_tlsError', (error: Error) => {
      if (secureEstablished) {
        connection._handleNetworkError(error);
      } else {
        onSecure(error);
      }
    });

    secureSocket.pipe(connection._protocol);
    connection._protocol.on('data', (data: Buffer) => secureSocket.write(data));

    secureSocket.on('secure', function (this: any) {
      secureEstablished = true;
      const chainError = this.ssl.verifyError();
      // added: host name of DSN must match certificate
      const identityError = chainError ? null : tls.checkServerIdentity(expectedHost, this.getPeerCertificate());
      onSecure(chainError || identityError || null);
    });

    secureSocket._start();
  };
};
