import React from 'react';
import './App.css';
import ViewPort from './UI/ViewPort/ViewPort';
import Logo from './Component/Logo/Logo';
import ApplicationRenderer from './Component/ApplicationRenderer/ApplicationRenderer';
import MainMenu from './Component/MainMenu/MainMenu';
import {whatsNew} from './Component/Application/applications';
import ConnectionList from './Component/ConnectionList/ConnectionList';
import ConnectionManager from './Library/Connection/ConnectionManager';
import ServerConfig from './Library/Config/ServerConfig';
import ResizableColumns from './UI/ResizableColumns/ResizableColumns';
// last - overrides styles of components
import './polish.css';

const styleOfMainLeftMenu = {
  background: 'var(--panel)',
  height: '100%',
}

// run connection manager
ConnectionManager.getInstance().menage();
// connections defined by administrator, whether own connections are allowed
ServerConfig.load();

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
