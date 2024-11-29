import React from 'react';
import './App.css';
import ViewPort from './UI/ViewPort/ViewPort';
import HorizontalResizableColumn from './UI/HorizontalResizableColumn/HorizontalResizableColumn';
import Logo from './Component/Logo/Logo';
import AdjustableColumn from './UI/AdjustableColumn/AdjustableColumn';
import ApplicationRenderer from './Component/ApplicationRenderer/ApplicationRenderer';
import WhatsNew from './Component/Application/WhatsNew/WhatsNew';
import TabInterface from './Component/ApplicationRenderer/Interface/TabInterface';

const styleOfMainLeftMenu = {
  background: '#3c3f41',
}

const defaultTab:TabInterface<undefined> = {
  component: WhatsNew,
  props: undefined,
  isActive: true,
  tabName: 'Whats New?'
}

function App() {
  return (
    <ViewPort>
      <HorizontalResizableColumn
        name="main-left-menu"
        style={styleOfMainLeftMenu}
      >
        <Logo />
      </HorizontalResizableColumn>
      <AdjustableColumn>
        <ApplicationRenderer
          defaultTab={defaultTab}
        />
      </AdjustableColumn>
    </ViewPort>
  );
}

export default App;
