import React, {Component} from 'react';
import './style.css';
import TabOpener from '../TabOpener/TabOpener';
import {newDatabaseConnection, testApp, whatsNew} from '../Application/applications';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCrosshairs, faHome, faKeyboard, faListOl, faMoon, faNetworkWired, faSun} from '@fortawesome/free-solid-svg-icons';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import ThemeManager, {useTheme} from '../../Library/Theme/ThemeManager';
import {SHORTCUT_HELP_EVENT} from '../../Library/Shortcuts/Shortcuts';
import ShortcutHelp from '../Shortcuts/ShortcutHelp';
import SshHostKeyPrompt from '../SshTunnel/SshHostKeyPrompt';
import {useServerConfig} from '../../Library/Config/ServerConfig';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';
import RevealActiveTab, {useRevealEnabled} from '../../Library/Sidebar/RevealActiveTab';


export default () => {
  const theme = useTheme();
  const revealEnabled = useRevealEnabled();
  // administrator can allow only connections defined on server
  const {allowCustomConnections} = useServerConfig();


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
          {allowCustomConnections && (
            <TabOpener<undefined>
              tab={newDatabaseConnection}
              tooltip={"Creating new connection"}
            >
              <FontAwesomeIcon icon={faNetworkWired} />
            </TabOpener>
          )}
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
            className={`reveal-active-tab ${revealEnabled ? 'active' : ''}`}
            tooltip={revealEnabled
              ? 'Always select opened table: on - sidebar shows table of current tab (click to turn off)'
              : 'Always select opened table: off - click to show table of current tab in sidebar on every switch of tab'}
            onClickLeft={() => RevealActiveTab.toggle()}
            onClickWheel={() => RevealActiveTab.toggle()}
          >
            <FontAwesomeIcon icon={faCrosshairs} />
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
        <SshHostKeyPrompt />

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

