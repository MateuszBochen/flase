"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MysqlAdapter_1 = __importDefault(require("./Drivers/Mysql/MysqlAdapter"));
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
            case 'mysql':
                return new MysqlAdapter_1.default(connectionData, parsedDsn);
            default:
                throw new Error(`Given ${parsedDsn.driver} is not supported yet`);
        }
    }
}
exports.default = DriverFactory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJpdmVyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvRHJpdmVyL0RyaXZlckZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxnRkFBd0Q7QUFFeEQsb0RBQW9EO0FBRXBEOztHQUVHO0FBQ0gsTUFBTSxhQUFhO0lBRWpCOztPQUVHO0lBQ0gsU0FBUyxDQUFDLGNBQTBDO1FBRWxELE1BQU0sU0FBUyxHQUFHLDRCQUFlLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUVyRSxRQUFPLFNBQVMsQ0FBQyxNQUFNLEVBQUU7WUFDdkIsS0FBSyxPQUFPO2dCQUNWLE9BQU8sSUFBSSxzQkFBWSxDQUFDLGNBQWMsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNyRDtnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsU0FBUyxDQUFDLE1BQU0sdUJBQXVCLENBQUMsQ0FBQztTQUNyRTtJQUNILENBQUM7Q0FDRjtBQUVELGtCQUFlLGFBQWEsQ0FBQyJ9