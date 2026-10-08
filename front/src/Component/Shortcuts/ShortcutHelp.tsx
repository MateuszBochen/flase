import React, {useEffect, useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import {SHORTCUT_HELP_EVENT, SHORTCUTS} from '../../Library/Shortcuts/Shortcuts';
import './style.css';

/** ShortcutHelp - list of keyboard shortcuts */
export default () => {
  const [open, setOpen] = useState<boolean>(false);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(SHORTCUT_HELP_EVENT, onOpen);
    return () => window.removeEventListener(SHORTCUT_HELP_EVENT, onOpen);
  }, []);

  if (!open) return null;
  return (
    <Popup
      isOpen={true}
      label="Keyboard shortcuts"
      onClickOk={() => setOpen(false)}
      buttons={[<Button key="close" size="small" label="Close" onClick={() => setOpen(false)} />]}
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
