import EventInterface from '../../EventBus/EventInterface';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import Database from '../../Database/Interface/Database';

type TableListWasReloadedType = {connection: ConnectionDataInterface, database: Database};

/**
 * trigger when list of tables of database is loaded again (cached list was dropped)
 * @author Mateusz Bochen
 */
class TableListWasReloaded implements EventInterface<TableListWasReloadedType> {
  private readonly data: TableListWasReloadedType;

  constructor(data: TableListWasReloadedType) {
    this.data = data;
  }

  getData(): TableListWasReloadedType {
    return this.data;
  }
}

export default TableListWasReloaded;
