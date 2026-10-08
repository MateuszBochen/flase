import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import './style/style.css';

export type ContextMenuItem = {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** hint shown on the right, e.g. keyboard shortcut or count */
  hint?: string;
  /** submenu shown on hover */
  children?: ContextMenuItem[];
} | 'separator';

interface ContextMenuPropsInterface {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** submenu is moved up when it would end below the window (menu opened at bottom of screen) */
const NestedMenu = (props: {children: React.ReactNode}) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState<number>(0);
  useLayoutEffect(() => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      setShift(Math.min(0, window.innerHeight - rect.bottom - 4));
    }
  }, []);
  return (
    <div ref={ref} className="ui-context-menu ui-context-menu-nested" role="menu" style={{marginTop: shift}}>
      {props.children}
    </div>
  );
};

/**
 * ContextMenu - menu shown at mouse position, closes on click outside, Escape, scroll or resize
 * @author Mateusz Bochen
 */
const ContextMenu = (props: ContextMenuPropsInterface) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({left: props.x, top: props.y});
  /** submenus open to the left when there is no space on the right */
  const [nestedLeft, setNestedLeft] = useState<boolean>(false);
  /** label of open submenu - it closes with delay, so moving pointer to it does not close it */
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openNow = (label: string) => {
    clearTimeout(closeTimer.current);
    setOpenSubmenu(label);
  };
  const closeLater = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpenSubmenu(null), 300);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** keep menu inside the window */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const left = Math.max(0, Math.min(props.x, window.innerWidth - rect.width - 4));
    setPosition({
      left,
      top: Math.max(0, Math.min(props.y, window.innerHeight - rect.height - 4)),
    });
    setNestedLeft(left + rect.width + 200 > window.innerWidth);
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
      className={`ui-context-menu ${nestedLeft ? 'nested-left' : ''}`}
      style={position}
      role="menu"
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.items.map((item, index) => {
        if (item === 'separator') {
          return <div className="ui-context-menu-separator" key={`separator-${index}`} />;
        }
        if (item.children) {
          return (
            <div
              className={`ui-context-menu-submenu ${openSubmenu === item.label ? 'open' : ''}`}
              key={item.label}
              onMouseEnter={() => !item.disabled && openNow(item.label)}
              onMouseLeave={closeLater}
            >
              <button
                type="button"
                role="menuitem"
                aria-label={item.label}
                aria-haspopup="menu"
                aria-expanded={openSubmenu === item.label}
                className="ui-context-menu-item"
                disabled={item.disabled}
                onClick={() => openNow(item.label)}
              >
                <span className="ui-context-menu-label">{item.label}</span>
                <span className="ui-context-menu-hint">▸</span>
              </button>
              {!item.disabled && openSubmenu === item.label && (
                <NestedMenu>
                  {item.children.map((child, childIndex) => child === 'separator'
                    ? <div className="ui-context-menu-separator" key={`separator-${childIndex}`} />
                    : (
                      <button
                        key={child.label}
                        type="button"
                        role="menuitem"
                        aria-label={child.label}
                        className="ui-context-menu-item"
                        disabled={child.disabled}
                        onClick={() => {
                          props.onClose();
                          child.onClick?.();
                        }}
                      >
                        <span className="ui-context-menu-label">{child.label}</span>
                        {child.hint && <span className="ui-context-menu-hint">{child.hint}</span>}
                      </button>
                    ))}
                </NestedMenu>
              )}
            </div>
          );
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
