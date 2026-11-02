import React, {memo} from 'react';
import {dom, IconDefinition} from '@fortawesome/fontawesome-svg-core';

// classes of icons (svg-inline--fa, fa-spin) come from CSS of Font Awesome - inserted here when no other icon did it yet
let cssInserted = false;
const insertCss = () => {
  if (!cssInserted && typeof document !== 'undefined') {
    cssInserted = true;
    dom.insertCss();
  }
};

interface IconPropsInterface {
  icon: IconDefinition;
  spin?: boolean;
  className?: string;
}

/**
 * Icon - SVG of Font Awesome icon written directly; FontAwesomeIcon computes the SVG on every render
 * (measured: ~16 ms of opening a table with 50 columns - sort arrows of every header, icons of cells and footer)
 */
export default memo(({icon, spin, className}: IconPropsInterface) => {
  insertCss();
  const [width, height, , , path] = icon.icon;
  return (
    <svg
      className={`svg-inline--fa fa-${icon.iconName}${spin ? ' fa-spin' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden="true"
      focusable="false"
      data-prefix={icon.prefix}
      data-icon={icon.iconName}
      role="img"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
    >
      <path fill="currentColor" d={Array.isArray(path) ? path.join(' ') : path} />
    </svg>
  );
});
