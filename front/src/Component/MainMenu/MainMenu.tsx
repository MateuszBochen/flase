import React, {Component} from 'react';

// import IconButton from '../Buttons/IconButton';
// import WorkPlaceAction from '../../Actions/WorkPlaceAction';
// import WhatsNew from '../../Containers/WhatsNew/WhatsNew';
//import ProcessList from '../../Containers/ProcessList/ProcessList';
import './style.css';
import TabOpener from '../TabOpener/TabOpener';
import {testApp, whatsNew} from '../Application/applications';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faHome, faListOl} from '@fortawesome/free-solid-svg-icons';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';


// import TableData from "../../Containers/Table/TableData";


/*const MAIN_PAGE = {
    id: (new Date()).getTime(),
    tabName: 'Whats new?',
    tabProperties: {},
    renderComponent: WhatsNew,
}

const PROCESS_LIST_PAGE = {
    id: (new Date()).getTime(),
    tabName: 'Process List',
    tabProperties: {
        database: '',
        query: "SHOW PROCESSLIST"
    },
    renderComponent: TableData,
}*/



export default () => {


  return (
    <div className="main-menu-root">
      <div className="buttons-bar">
        <HorizontalButtonList>
          <TabOpener<undefined>
            tab={whatsNew}
          >
            <FontAwesomeIcon icon={faHome} />
          </TabOpener>
          <TabOpener<undefined>
            tab={testApp}
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

