"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const MysqlAdapter_1 = __importDefault(require("./Drivers/Mysql/MysqlAdapter"));
/**
 * Driver class factory.
 */
class DriverFactory {
    /**
     * Metod taking name and connection data to create new data driver.
     */
    getDriver(driverName, connectionData) {
        switch (driverName) {
            case 'mysql':
                return new MysqlAdapter_1.default(connectionData);
            default:
                throw new Error(`Given ${driverName} is not supported yet`);
        }
    }
}
exports.default = DriverFactory;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJpdmVyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Ecml2ZXIvRHJpdmVyRmFjdG9yeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLGdGQUF3RDtBQUl4RDs7R0FFRztBQUNILE1BQU0sYUFBYTtJQUVqQjs7T0FFRztJQUNILFNBQVMsQ0FBQyxVQUFrQixFQUFFLGNBQWtDO1FBRTlELFFBQU8sVUFBVSxFQUFFO1lBQ2pCLEtBQUssT0FBTztnQkFDVixPQUFPLElBQUksc0JBQVksQ0FBQyxjQUFjLENBQUMsQ0FBQztZQUMxQztnQkFDRSxNQUFNLElBQUksS0FBSyxDQUFDLFNBQVMsVUFBVSx1QkFBdUIsQ0FBQyxDQUFDO1NBQy9EO0lBQ0gsQ0FBQztDQUNGO0FBRUQsa0JBQWUsYUFBYSxDQUFDIn0=