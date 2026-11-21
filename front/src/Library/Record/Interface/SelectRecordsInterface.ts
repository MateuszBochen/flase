import {SingleRowType} from '../../../Component/Table/Interface/RecordsViewPropsInterface';

/** batch of result rows (SELECT_RECORDS) */
interface SelectRecordsInterface {
  rows: SingleRowType[];
  tabId?: string;
}

export default SelectRecordsInterface;
