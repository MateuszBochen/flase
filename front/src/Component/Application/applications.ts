import TabInterface from '../ApplicationRenderer/Interface/TabInterface';
import WhatsNew from './WhatsNew/WhatsNew';
import TestApp from './TestApp/TestApp';
import NewDatabaseConnection from './NewDatabaseConnection/NewDatabaseConnection';

export const  whatsNew:TabInterface<undefined> = {
  component: WhatsNew,
  props: undefined,
  isActive: true,
  tabName: 'Whats New?'
}


export const  testApp:TabInterface<undefined> = {
  component: TestApp,
  props: undefined,
  isActive: true,
  tabName: 'Test App'
}

export const  newDatabaseConnection:TabInterface<undefined> = {
  component: NewDatabaseConnection,
  props: undefined,
  isActive: true,
  tabName: 'New Database Connection'
}
