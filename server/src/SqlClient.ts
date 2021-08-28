import {TransformCallback} from "stream";

const stream = require('stream');

class SqlClient {
    connection;

    constructor(sqlConnection:any) {
        this.connection = sqlConnection;
        setInterval(this._keepalive, 1000 * 60 * 5);
    }

    queryResults = (query:string, callbackOk: (results:any, fields:any) => void, callBackError: (error:any) => void) => {
        this.connection.query(query, (err:any, results:any, fields:any) => {
            if (err) {
                console.log(err);
                if (callBackError) {
                    try {
                        callBackError(err);
                    } catch (e) {
                        console.log(e);
                    }

                    return;
                }
            }

            if (callbackOk) {
                try {
                    callbackOk(results, fields);
                } catch (e) {
                    console.log(e);
                }
            }
        });
    }

    streamQueryResults = (query:string, callbackOk: (results:any) => void, callBackError: (error:any) => void) => {
        try {
            this.connection.query(query)
                .on('error', (err:any) => {
                    console.log(err);
                    if (callBackError) {
                        try {
                            callBackError(err);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                })
                .stream()
                .pipe(new stream.Transform({
                    objectMode: true,
                    transform: (row:any, encoding:BufferEncoding, callback:TransformCallback) => {
                        if (callbackOk) {
                            try {
                                callbackOk(row);
                            } catch (e) {
                                console.log(e);
                            }
                        }

                        try {
                            callback();
                        } catch (e) {
                            console.log(e);
                        }
                    }
                }));
        } catch (e) {
            console.log(e);
        }
    }

    _keepalive = () => {
        try {
            this.connection.query('SELECT 1 + 1 AS solution', (err:any) => {
                if (err) {
                    console.log(err.code); // 'ER_BAD_DB_ERROR'
                }
                console.log('Keepalive RDS connection pool using connection id');
            });
        } catch (e) {
            console.log(e);
        }
    }
}

module.exports = SqlClient;
