"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = require('mysql');
class MysqlAdapter {
    constructor(connection) {
        this.nativeCollection = connection;
    }
    static connect(connectionData) {
        const connection = mysql.createConnection({
            host: connectionData.host,
            user: connectionData.user,
            password: connectionData.password,
            insecureAuth: true,
            multipleStatements: true,
        });
        return new Promise((resolve, reject) => {
            connection.connect((err) => {
                if (err) {
                    return reject(err);
                }
                resolve(new MysqlAdapter(connection));
            });
        });
    }
}
exports.default = MysqlAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0RyaXZlci9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFFQSxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFL0IsTUFBTSxZQUFZO0lBSWhCLFlBQW9CLFVBQWU7UUFDakMsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFVBQVUsQ0FBQztJQUVyQyxDQUFDO0lBRUQsTUFBTSxDQUFDLE9BQU8sQ0FBQyxjQUFrQztRQUMvQyxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsZ0JBQWdCLENBQUM7WUFDeEMsSUFBSSxFQUFFLGNBQWMsQ0FBQyxJQUFJO1lBQ3pCLElBQUksRUFBRSxjQUFjLENBQUMsSUFBSTtZQUN6QixRQUFRLEVBQUUsY0FBYyxDQUFDLFFBQVE7WUFDakMsWUFBWSxFQUFFLElBQUk7WUFDbEIsa0JBQWtCLEVBQUUsSUFBSTtTQUN6QixDQUFDLENBQUM7UUFJSCxPQUFPLElBQUksT0FBTyxDQUFDLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3JDLFVBQVUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxHQUFRLEVBQUUsRUFBRTtnQkFDOUIsSUFBSSxHQUFHLEVBQUU7b0JBQ1AsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ3BCO2dCQUVELE9BQU8sQ0FBQyxJQUFJLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3hDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFFRCxrQkFBZSxZQUFZLENBQUMifQ==