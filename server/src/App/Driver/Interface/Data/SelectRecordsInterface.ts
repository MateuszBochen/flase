import RecordType from '../../../../Driver/Type/Data/RecordType';

/** batch of result rows (SELECT_RECORDS) */
interface SelectRecordsInterface {
  rows: RecordType[];
  tabId?: string;
}

export default SelectRecordsInterface;
