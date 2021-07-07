import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';

class TabsRender extends Component{
    constructor(props) {
        super(props);
        this.workPlaceAction = new WorkPlaceAction();
    }

    onMouseDownHandler = (e, tabNumber) => {
        switch (e.button) {
            case 0:
                this.workPlaceAction.switchTab(tabNumber)
                break;
            case 1:
                this.workPlaceAction.closeTab(tabNumber);
                break;
            default:
                break;
        }
    }

    closeTabHandler = (e, tabNumber) => {
        e.stopPropagation();
        e.nativeEvent.stopPropagation();
        this.workPlaceAction.closeTab(tabNumber)
    };

    renderTabItem = (item, tabNumber, currentTab) => {
        const isActive = tabNumber === currentTab ? 'active' : '';

        return (
            <li
                className={`tabs-render-list-item ${isActive}`}
                key={`${tabNumber}_${item.tabName}`}
                onMouseDown={(e) => this.onMouseDownHandler(e, tabNumber)}
            >
                {item.tabName}
                <span
                    className="close-tab"
                    onMouseDown={(e) => this.closeTabHandler(e, tabNumber)}
                >
                    <span className="close-tab-icon">
                        X
                    </span>
                </span>
            </li>
        );
    };


    render() {
        const { currentTab, tabs} = this.props.workPlace;

        return (
            <div className="tabs-render">
                <ul className="tabs-render-list">
                    {tabs.map((item, index) => this.renderTabItem(item, index, currentTab))}
                </ul>
            </div>
        );
    }
}

const mapStateToProps = state => ({
    workPlace: { ...state.workPlace },
});

export default connect(mapStateToProps)(TabsRender);