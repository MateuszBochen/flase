import {MutableRefObject} from 'react';


/**
 * @author Mateusz Bochen
 */
interface HeaderColumnsPropsInterface {
  onColumnDidMount: () => void;
  onSort: () => void;
  parentRef: MutableRefObject<HTMLDivElement | null>;
}

export default HeaderColumnsPropsInterface;
