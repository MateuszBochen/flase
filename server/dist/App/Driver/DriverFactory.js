"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MysqlAdapter_1 = __importDefault(require("./Drivers/Mysql/MysqlAdapter"));
const PostgresAdapter_1 = __importDefault(require("./Drivers/Postgres/PostgresAdapter"));
const dsn_parser_1 = require("@soluble/dsn-parser");
/**
 * Driver class factory.
 */
class DriverFactory {
    /**
     * Metod taking name and connection data to create new data driver.
     */
    getDriver(connectionData) {
        const parsedDsn = dsn_parser_1.parseDsnOrThrow(connectionData.connectionData.dsn);
        switch (parsedDsn.driver) {
            // MariaDB speaks MySQL protocol, differences are detected by server version
            case 'mysql':
            case 'mariadb':
                return new MysqlAdapter_1.default(connectionData, parsedDsn);
            case 'postgresql':
            case 'postgres':
            case 'pgsql':
                return new PostgresAdapter_1.default(connectionData, parsedDsn);
            default:
                throw new Error(`Given ${parsedDsn.driver} is not supported yet`);
        }
    }
}
exports.default = DriverFactory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJpdmVyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvRHJpdmVyL0RyaXZlckZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxnRkFBd0Q7QUFDeEQseUZBQWlFO0FBRWpFLG9EQUFvRDtBQUVwRDs7R0FFRztBQUNILE1BQU0sYUFBYTtJQUVqQjs7T0FFRztJQUNILFNBQVMsQ0FBQyxjQUEwQztRQUVsRCxNQUFNLFNBQVMsR0FBRyw0QkFBZSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFckUsUUFBTyxTQUFTLENBQUMsTUFBTSxFQUFFO1lBQ3ZCLDRFQUE0RTtZQUM1RSxLQUFLLE9BQU8sQ0FBQztZQUNiLEtBQUssU0FBUztnQkFDWixPQUFPLElBQUksc0JBQVksQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDckQsS0FBSyxZQUFZLENBQUM7WUFDbEIsS0FBSyxVQUFVLENBQUM7WUFDaEIsS0FBSyxPQUFPO2dCQUNWLE9BQU8sSUFBSSx5QkFBZSxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUN4RDtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsU0FBUyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsQ0FBQztTQUNyRTtJQUNILENBQUM7Q0FDRjtBQUVELGtCQUFlLGFBQWEsQ0FBQyJ9