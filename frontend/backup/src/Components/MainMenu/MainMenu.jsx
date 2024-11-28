import React, {Component} from 'react';
import { faListOl, faHome } from '@fortawesome/fontawesome-free-solid';
import IconButton from '../Buttons/IconButton';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import WhatsNew from '../../Containers/WhatsNew/WhatsNew';
//import ProcessList from '../../Containers/ProcessList/ProcessList';
import './style.css';
import TableData from "../../Containers/Table/TableData";


const MAIN_PAGE = {
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
}



class MainMenu extends Component {

    constructor(props) {
        super(props);
        this.workPlaceAction = new WorkPlaceAction();
    }

    onMouseDownHandler = (e, componentData) => {
        if (e.button === 1) {
            this.workPlaceAction.addNewTab(componentData);
        } else {
            this.workPlaceAction.openInCurrentTab(componentData);
        }
    }

    render() {
        return (
            <div className="cmp-main-menu">
                <div className="buttons-bar">
                    <IconButton
                        icon={faHome}
                        onMouseDown={(e) => this.onMouseDownHandler(e, { ...MAIN_PAGE})}
                    />
                    <IconButton
                        icon={faListOl}
                        onMouseDown={(e) => this.onMouseDownHandler(e, { ...PROCESS_LIST_PAGE})}
                    />
                </div>
            </div>
        );
    }
}

export default MainMenu;
