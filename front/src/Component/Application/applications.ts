import TabInterface from '../ApplicationRenderer/Interface/TabInterface';
import WhatsNew from './WhatsNew/WhatsNew';
import TestApp from './TestApp/TestApp';

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
