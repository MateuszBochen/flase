import React from 'react';
import WhatsNew from '../Containers/WhatsNew/WhatsNew';

class WorkPlaceReducer {
    constructor() {
        this.initalState = {
            tabs: [this.defaultTab()],
            currentTab: 0,
        };
    }


    handler = (state = this.initalState, action) => {
        switch (action.type) {
            case 'WorkPlaceAction_switchTab':
               return this.switchTab(state, action.data);
            case 'WorkPlaceAction_addNewTab':
               return this.addNewTab(state, action.data);
           case 'WorkPlaceAction_openInCurrentTab':
               return this.openInCurrentTab(state, action.data);
           case 'WorkPlaceAction_closeTab':
               return this.closeTab(state, action.data);
            default:
                return state;
        }
    }

    switchTab = (state, tabNumber) => {
        const newState = { ...state };
        newState.tabs = state.tabs;
        newState.currentTab = tabNumber;
        return newState;
    }

    cloneTabs = (tabs) => {

        return tabs.map((item) => {
            const newItem = { ...item };
            newItem.renderComponent = item.renderComponent;
            return newItem;
        });
    }

    addNewTab = (state, newTabElement) => {
        const newState = { ...state };
        if (newState.tabs.length === 0) {
            newState.currentTab = 0;
        }

        newTabElement.tabProperties.key = newTabElement.id;
        newTabElement.tabProperties.tabIndex = newState.tabs.length;
        newTabElement.renderComponent = React.createElement(newTabElement.renderComponent, newTabElement.tabProperties);

        newState.tabs = state.tabs;

        newState.tabs.push(newTabElement);
        return newState;
    }

    openInCurrentTab = (state, tabElement) => {
        if (state.tabs.length === 0) {
            return this.addNewTab(state, tabElement);
        }

        const newState = { ...state };

        tabElement.tabProperties.tabIndex = newState.currentTab;
        tabElement.tabProperties.key = tabElement.id;
        tabElement.renderComponent = React.createElement(tabElement.renderComponent, tabElement.tabProperties);

        newState.tabs = state.tabs;
        newState.tabs[newState.currentTab] = tabElement;
        return newState;
    }

    closeTab = (state, tabToClose) => {
        const newState = { ...state };
        const newTabs = [];
        newState.tabs.forEach((item, index) => {
           if (index !== tabToClose) {
               newTabs.push(item);
           } else {
               newState.currentTab = index - 1;
           }
        });

        newState.tabs = newTabs;
        return newState;
    }

    defaultTab = () => {
        return {
            id: 1,
            tabName: 'Whats new?',
            tabProperties: {},
            renderComponent: React.createElement(WhatsNew),
        }
    }
}

export default WorkPlaceReducer;
