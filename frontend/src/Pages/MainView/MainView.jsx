import React, {Component} from 'react';
import Logo from '../../Components/Workspce/Logo/Logo';
import DatabaseList from '../../Containers/DatabaseList/DatabaseList';
import TabsRender from './TabsRender';
import WorkPlaceRender from './WorkPlaceRender';
import MainMenu from '../../Components/MainMenu/MainMenu';
import './style.css';

class MainView extends Component {
    constructor(props) {
        super(props);
        this.changeWidthIsEnabled = false;
        this.state = {
            menuWidth:  localStorage.getItem('workspace-menu-width') || '15%',
        }
    }
    changeWithHandler = (e) => {
        if (this.changeWidthIsEnabled) {
            const width = `${e.pageX}px`;
            this.setState({
                menuWidth: width,
            });
            localStorage.setItem('workspace-menu-width', width);
        }
    };

    render() {
        const { menuWidth } = this.state;
        return (
            <div
                className="main-view-main"
                onMouseMove={this.changeWithHandler}
                onMouseUp={() => this.changeWidthIsEnabled = false}
            >
                <div
                    onMouseUp={() => this.changeWidthIsEnabled = false}
                    className="column-menu"
                    style={{width: menuWidth}}
                >
                    <Logo />
                    <MainMenu />
                    <DatabaseList />
                    <div
                        className="movable-with-menu-handler"
                        onMouseDown={() => this.changeWidthIsEnabled = true}
                        onMouseUp={() => this.changeWidthIsEnabled = false}
                    />
                </div>
                <div
                    className="column-workspace"
                    style={{width: `calc(100% - ${menuWidth}`}}
                >
                    <div className="tabs-list">
                        <TabsRender />
                    </div>
                    <div className="workspace">
                        <WorkPlaceRender />
                    </div>
                </div>
            </div>
        );
    }
}

export default MainView;
