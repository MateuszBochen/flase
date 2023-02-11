import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';


class WorkPlaceRender extends Component {
    createElement = (element, condition) => {
        return (
            <div
                className="workspace-container"
                key={`wrapper_${element.id}`}
                style={{ display: condition ? null : 'none' }}
            >
                {element.renderComponent}
            </div>
        );
    }

    render() {
        const { currentTab, tabs} = this.props.workPlace;
        const component = tabs[currentTab];

        if (!component) {
            return (
                <div>

                </div>
            );
        }

        return (
            <div>
                {tabs.map((item, index) => this.createElement(item, index === currentTab))}
            </div>
        );
    }
}

const mapStateToProps = state => ({
    workPlace: { ...state.workPlace },
});

export default connect(mapStateToProps)(WorkPlaceRender);
