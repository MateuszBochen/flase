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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiRHJpdmVyRmFjdG9yeS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9BcHAvRHJpdmVyL0RyaXZlckZhY3RvcnkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDQSxnRkFBd0Q7QUFHeEQ7O0dBRUc7QUFDSCxNQUFNLGFBQWE7SUFFakI7O09BRUc7SUFDSCxTQUFTLENBQUMsVUFBa0IsRUFBRSxjQUEwQztRQUV0RSxRQUFPLFVBQVUsRUFBRTtZQUNqQixLQUFLLE9BQU87Z0JBQ1YsT0FBTyxJQUFJLHNCQUFZLENBQUMsY0FBYyxDQUFDLENBQUM7WUFDMUM7Z0JBQ0UsTUFBTSxJQUFJLEtBQUssQ0FBQyxTQUFTLFVBQVUsdUJBQXVCLENBQUMsQ0FBQztTQUMvRDtJQUNILENBQUM7Q0FDRjtBQUVELGtCQUFlLGFBQWEsQ0FBQyJ9