import React, {Component} from 'react';
import './style.css';
import TabOpener from '../TabOpener/TabOpener';
import {newDatabaseConnection, testApp, whatsNew} from '../Application/applications';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faHome, faKeyboard, faListOl, faMoon, faNetworkWired, faSun} from '@fortawesome/free-solid-svg-icons';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import ThemeManager, {useTheme} from '../../Library/Theme/ThemeManager';
import {SHORTCUT_HELP_EVENT} from '../../Library/Shortcuts/Shortcuts';
import ShortcutHelp from '../Shortcuts/ShortcutHelp';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';


export default () => {
  const theme = useTheme();


  return (
    <div className="main-menu-root">
      <div className="buttons-bar">
        <HorizontalButtonList>
          <TabOpener<undefined>
            tab={whatsNew}
            tooltip={"Home page"}
          >
            <FontAwesomeIcon icon={faHome} />
          </TabOpener>
          <TabOpener<undefined>
            tab={newDatabaseConnection}
            tooltip={"Creating new connection"}
          >
            <FontAwesomeIcon icon={faNetworkWired} />
          </TabOpener>
          <TabOpener<undefined>
            tab={testApp}
            tooltip={"Test application"}
          >
            <FontAwesomeIcon icon={faListOl} />
          </TabOpener>
          <InvisibleButton
            tooltip={theme === 'dark' ? 'Light theme (Alt+Shift+D)' : 'Dark theme (Alt+Shift+D)'}
            onClickLeft={() => ThemeManager.toggle()}
            onClickWheel={() => ThemeManager.toggle()}
          >
            <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
          </InvisibleButton>
          <InvisibleButton
            tooltip="Keyboard shortcuts (F1)"
            onClickLeft={() => window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT))}
            onClickWheel={() => window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT))}
          >
            <FontAwesomeIcon icon={faKeyboard} />
          </InvisibleButton>
        </HorizontalButtonList>
        <ShortcutHelp />

        {/*<IconButton
                    icon={faHome}
                    onMouseDown={(e) => this.onMouseDownHandler(e, { ...MAIN_PAGE})}
                />
                <IconButton
                    icon={faListOl}
                    onMouseDown={(e) => this.onMouseDownHandler(e, { ...PROCESS_LIST_PAGE})}
                />*/}
      </div>
    </div>
  );


}

