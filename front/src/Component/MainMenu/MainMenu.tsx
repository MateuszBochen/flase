import React, {Component} from 'react';
import './style.css';
import TabOpener from '../TabOpener/TabOpener';
import {newDatabaseConnection, testApp, whatsNew} from '../Application/applications';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faHome, faListOl, faNetworkWired} from '@fortawesome/free-solid-svg-icons';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';


export default () => {


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
        </HorizontalButtonList>

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

