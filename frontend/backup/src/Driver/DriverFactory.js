import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';


class DriverFactory {

    static adapterInstance = undefined;

    static getDriver() {
        if (!DriverFactory.adapterInstance) {
            DriverFactory.adapterInstance = new MysqlAdapter();
        }

        return DriverFactory.adapterInstance;
    }
}

export default DriverFactory;
