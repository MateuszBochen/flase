import React from 'react';
import './App.css';
import ViewPort from './UI/ViewPort/ViewPort';
import HorizontalResizableColumn from './UI/HorizontalResizableColumn/HorizontalResizableColumn';
import Logo from './Component/Logo/Logo';
import AdjustableColumn from './UI/AdjustableColumn/AdjustableColumn';
import ApplicationRenderer from './Component/ApplicationRenderer/ApplicationRenderer';
import MainMenu from './Component/MainMenu/MainMenu';
import {whatsNew} from './Component/Application/applications';
// import {Parser} from 'node-sql-parser';

const styleOfMainLeftMenu = {
  background: '#3c3f41',
}
// const parser = new Parser();


function App() {
  return (
    <ViewPort>
      <HorizontalResizableColumn
        name="main-left-menu"
        style={styleOfMainLeftMenu}
      >
        <Logo />
        <MainMenu />
      </HorizontalResizableColumn>
      <AdjustableColumn>
        <ApplicationRenderer
          defaultTab={whatsNew}
        />
      </AdjustableColumn>
    </ViewPort>
  );
}

export default App;
