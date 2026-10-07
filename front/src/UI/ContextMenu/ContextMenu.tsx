import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import './style/style.css';

export type ContextMenuItem = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** hint shown on the right, e.g. keyboard shortcut or count */
  hint?: string;
} | 'separator';

interface ContextMenuPropsInterface {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/**
 * ContextMenu - menu shown at mouse position, closes on click outside, Escape, scroll or resize
 * @author Mateusz Bochen
 */
const ContextMenu = (props: ContextMenuPropsInterface) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({left: props.x, top: props.y});

  /** keep menu inside the window */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(0, Math.min(props.x, window.innerWidth - rect.width - 4)),
      top: Math.max(0, Math.min(props.y, window.innerHeight - rect.height - 4)),
    });
  }, [props.x, props.y]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        props.onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && props.onClose();
    const close = () => props.onClose();

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', close);
    window.addEventListener('wheel', close, {passive: true});
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', close);
      window.removeEventListener('wheel', close);
    };
  }, [props.onClose]);

  return (
    <div
      ref={menuRef}
      className="ui-context-menu"
      style={position}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.items.map((item, index) => {
        if (item === 'separator') {
          return <div className="ui-context-menu-separator" key={`separator-${index}`} />;
        }
        return (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            aria-label={item.label}
            className={`ui-context-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              props.onClose();
              item.onClick?.();
            }}
          >
            <span className="ui-context-menu-label">{item.label}</span>
            {item.hint && <span className="ui-context-menu-hint">{item.hint}</span>}
          </button>
        );
      })}
    </div>
  );
};

export default ContextMenu;
