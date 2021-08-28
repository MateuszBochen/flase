"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream = require('stream');
class SqlClient {
    constructor(sqlConnection) {
        this.queryResults = (query, callbackOk, callBackError) => {
            this.connection.query(query, (err, results, fields) => {
                if (err) {
                    console.log(err);
                    if (callBackError) {
                        try {
                            callBackError(err);
                        }
                        catch (e) {
                            console.log(e);
                        }
                        return;
                    }
                }
                if (callbackOk) {
                    try {
                        callbackOk(results, fields);
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
            });
        };
        this.streamQueryResults = (query, callbackOk, callBackError) => {
            try {
                this.connection.query(query)
                    .on('error', (err) => {
                    console.log(err);
                    if (callBackError) {
                        try {
                            callBackError(err);
                        }
                        catch (e) {
                            console.log(e);
                        }
                    }
                })
                    .stream()
                    .pipe(new stream.Transform({
                    objectMode: true,
                    transform: (row, encoding, callback) => {
                        if (callbackOk) {
                            try {
                                callbackOk(row);
                            }
                            catch (e) {
                                console.log(e);
                            }
                        }
                        try {
                            callback();
                        }
                        catch (e) {
                            console.log(e);
                        }
                    }
                }));
            }
            catch (e) {
                console.log(e);
            }
        };
        this._keepalive = () => {
            try {
                this.connection.query('SELECT 1 + 1 AS solution', (err) => {
                    if (err) {
                        console.log(err.code); // 'ER_BAD_DB_ERROR'
                    }
                    console.log('Keepalive RDS connection pool using connection id');
                });
            }
            catch (e) {
                console.log(e);
            }
        };
        this.connection = sqlConnection;
        setInterval(this._keepalive, 1000 * 60 * 5);
    }
}
module.exports = SqlClient;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3FsQ2xpZW50LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL1NxbENsaWVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUVBLE1BQU0sTUFBTSxHQUFHLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUVqQyxNQUFNLFNBQVM7SUFHWCxZQUFZLGFBQWlCO1FBSzdCLGlCQUFZLEdBQUcsQ0FBQyxLQUFZLEVBQUUsVUFBNkMsRUFBRSxhQUFrQyxFQUFFLEVBQUU7WUFDL0csSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsS0FBSyxFQUFFLENBQUMsR0FBTyxFQUFFLE9BQVcsRUFBRSxNQUFVLEVBQUUsRUFBRTtnQkFDOUQsSUFBSSxHQUFHLEVBQUU7b0JBQ0wsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakIsSUFBSSxhQUFhLEVBQUU7d0JBQ2YsSUFBSTs0QkFDQSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7eUJBQ3RCO3dCQUFDLE9BQU8sQ0FBQyxFQUFFOzRCQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7eUJBQ2xCO3dCQUVELE9BQU87cUJBQ1Y7aUJBQ0o7Z0JBRUQsSUFBSSxVQUFVLEVBQUU7b0JBQ1osSUFBSTt3QkFDQSxVQUFVLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO3FCQUMvQjtvQkFBQyxPQUFPLENBQUMsRUFBRTt3QkFDUixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUNsQjtpQkFDSjtZQUNMLENBQUMsQ0FBQyxDQUFDO1FBQ1AsQ0FBQyxDQUFBO1FBRUQsdUJBQWtCLEdBQUcsQ0FBQyxLQUFZLEVBQUUsVUFBaUMsRUFBRSxhQUFrQyxFQUFFLEVBQUU7WUFDekcsSUFBSTtnQkFDQSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7cUJBQ3ZCLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxHQUFPLEVBQUUsRUFBRTtvQkFDckIsT0FBTyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDakIsSUFBSSxhQUFhLEVBQUU7d0JBQ2YsSUFBSTs0QkFDQSxhQUFhLENBQUMsR0FBRyxDQUFDLENBQUM7eUJBQ3RCO3dCQUFDLE9BQU8sQ0FBQyxFQUFFOzRCQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7eUJBQ2xCO3FCQUNKO2dCQUNMLENBQUMsQ0FBQztxQkFDRCxNQUFNLEVBQUU7cUJBQ1IsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLFNBQVMsQ0FBQztvQkFDdkIsVUFBVSxFQUFFLElBQUk7b0JBQ2hCLFNBQVMsRUFBRSxDQUFDLEdBQU8sRUFBRSxRQUF1QixFQUFFLFFBQTBCLEVBQUUsRUFBRTt3QkFDeEUsSUFBSSxVQUFVLEVBQUU7NEJBQ1osSUFBSTtnQ0FDQSxVQUFVLENBQUMsR0FBRyxDQUFDLENBQUM7NkJBQ25COzRCQUFDLE9BQU8sQ0FBQyxFQUFFO2dDQUNSLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUM7NkJBQ2xCO3lCQUNKO3dCQUVELElBQUk7NEJBQ0EsUUFBUSxFQUFFLENBQUM7eUJBQ2Q7d0JBQUMsT0FBTyxDQUFDLEVBQUU7NEJBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzt5QkFDbEI7b0JBQ0wsQ0FBQztpQkFDSixDQUFDLENBQUMsQ0FBQzthQUNYO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNsQjtRQUNMLENBQUMsQ0FBQTtRQUVELGVBQVUsR0FBRyxHQUFHLEVBQUU7WUFDZCxJQUFJO2dCQUNBLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLENBQUMsR0FBTyxFQUFFLEVBQUU7b0JBQzFELElBQUksR0FBRyxFQUFFO3dCQUNMLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsb0JBQW9CO3FCQUM5QztvQkFDRCxPQUFPLENBQUMsR0FBRyxDQUFDLG1EQUFtRCxDQUFDLENBQUM7Z0JBQ3JFLENBQUMsQ0FBQyxDQUFDO2FBQ047WUFBQyxPQUFPLENBQUMsRUFBRTtnQkFDUixPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO2FBQ2xCO1FBQ0wsQ0FBQyxDQUFBO1FBN0VHLElBQUksQ0FBQyxVQUFVLEdBQUcsYUFBYSxDQUFDO1FBQ2hDLFdBQVcsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDaEQsQ0FBQztDQTRFSjtBQUVELE1BQU0sQ0FBQyxPQUFPLEdBQUcsU0FBUyxDQUFDIn0=