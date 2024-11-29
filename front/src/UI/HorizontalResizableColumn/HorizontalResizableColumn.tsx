import React, {useCallback, useState} from 'react';

import './css/style.css';
import HorizontalResizableColumnPropsInterface from './HorizontalResizableColumnPropsInterface';
import HorizontalResizableColumnSettings from './App/HorizontalResizableColumnSettings';

/**
 * Component for creation of left menu
 * @author Mateusz Bochen
 */
const HorizontalResizableColumn = (props: HorizontalResizableColumnPropsInterface) => {
  const horizontalResizableColumnSettings:HorizontalResizableColumnSettings = new HorizontalResizableColumnSettings();
  const [subMenuWidth, setSubMenuWidth] = useState<string>(horizontalResizableColumnSettings.getDefaultWithForName(props.name));

  /** enable resizing */
  const enableResizing = useCallback(() => {
    document.body.addEventListener('mousemove', moveMouseHandler);
    document.body.addEventListener('selectstart', disableSelecting);

    document.body.addEventListener(
      'mouseup',
      () => {
        document.body.removeEventListener('mousemove', moveMouseHandler);
        document.body.removeEventListener('selectstart', disableSelecting);
      }
    );
  }, []);

  /** handle change of submenu width */
  const moveMouseHandler = useCallback((event: MouseEvent) => {

    event.preventDefault(); // hak for prevent text selection
    event.stopPropagation(); // hak for prevent text selection
    // setPreventSelect('prevent-select');
    // prevent broken menu
    if (event.pageX < 30) {
      return;
    }

    const width = `${(event.pageX)}px`;
    setSubMenuWidth(width);
    horizontalResizableColumnSettings.setValue(props.name, width);

  }, []);

  const disableSelecting = useCallback((event: any) => {
    event.preventDefault();
  }, []);

  return (
    <div
      className="horizontal-resizable-column-root" style={{width: subMenuWidth, ...props.style}}
    >
      <div className="horizontal-resizable-column-resize-panel">
        <div className="horizontal-resizable-column-panel-handler" onMouseDown={enableResizing}/>
      </div>
      {props.children}
    </div>
  );
}

export default HorizontalResizableColumn;
