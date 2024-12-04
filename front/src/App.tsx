import React from 'react';
import './App.css';
import ViewPort from './UI/ViewPort/ViewPort';
import Logo from './Component/Logo/Logo';
import ApplicationRenderer from './Component/ApplicationRenderer/ApplicationRenderer';
import MainMenu from './Component/MainMenu/MainMenu';
import {whatsNew} from './Component/Application/applications';
import ConnectionList from './Component/ConnectionList/ConnectionList';
import ConnectionManager from './Library/Connection/ConnectionManager';
import ResizableColumns from './UI/ResizableColumns/ResizableColumns';

const styleOfMainLeftMenu = {
  background: '#3c3f41',
  height: '100%',
}

// run connection manager
ConnectionManager.getInstance().menage();

function App() {
  return (
    <ViewPort>
      <ResizableColumns
        name="main-left-menu"
        styleLeft={styleOfMainLeftMenu}
        leftSide={<><Logo /><MainMenu /><ConnectionList /></>}
        rightSide={<ApplicationRenderer defaultTab={whatsNew} />}

      />
    </ViewPort>
  );
}

export default App;
