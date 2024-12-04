import TableInformationInterface from '../../Table/Interface/TableInformationInterface';


interface DriverInterface {
  getDefaultQuery(table: TableInformationInterface): string;
}
export default DriverInterface;
