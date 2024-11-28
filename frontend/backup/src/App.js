import React, {Component} from 'react';
import LoginPage from './Pages/LoginPage/LoginPage';
import MainView from "./Pages/MainView/MainView";
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';


class App extends Component {



  render() {
    const {token} = this.props.login;

    if (token) {
      return (
          <div>
            <MainView />
          </div>
      );
    }

    return (
      <div>
        <LoginPage />
      </div>
    );
  }
}



export default App;
