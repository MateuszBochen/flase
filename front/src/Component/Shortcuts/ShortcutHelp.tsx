import React, {useEffect, useRef} from 'react';
import Popup from '../../UI/Popup/Popup';
import {PopupRefInterface} from '../../UI/Popup/Type/types';
import Button from '../../UI/Button/Button';
import {SHORTCUT_HELP_EVENT, SHORTCUTS} from '../../Library/Shortcuts/Shortcuts';
import './style.css';

/** ShortcutHelp - list of keyboard shortcuts */
export default () => {
  const popup = useRef<PopupRefInterface | null>(null);

  useEffect(() => {
    const onOpen = () => popup.current?.open();
    window.addEventListener(SHORTCUT_HELP_EVENT, onOpen);
    return () => window.removeEventListener(SHORTCUT_HELP_EVENT, onOpen);
  }, []);

  return (
    <Popup
      ref={popup}
      label="Keyboard shortcuts"
      onClickOk={() => popup.current?.close()}
      buttons={[<Button key="close" size="small" label="Close" onClick={() => popup.current?.close()} />]}
    >
      <div className="cmp-shortcut-help">
        {SHORTCUTS.map((group) => (
          <section key={group.group}>
            <h4>{group.group}</h4>
            {group.items.map((item) => (
              <div className="shortcut" key={item.keys + item.action}>
                <kbd>{item.keys}</kbd>
                <span>{item.action}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Popup>
  );
}
