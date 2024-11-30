import TabInterface from '../ApplicationRenderer/Interface/TabInterface';
import WhatsNew from './WhatsNew/WhatsNew';

export const  whatsNew:TabInterface<undefined> = {
  component: WhatsNew,
  props: undefined,
  isActive: true,
  tabName: 'Whats New?'
}
