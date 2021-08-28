import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import LoginPage from './Pages/LoginPage/LoginPage';
import MainView from "./Pages/MainView/MainView";
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import WebSocketClientFactory from "./Library/WebSocketClientFactory";

class App extends Component {

    constructor(props) {
        super(props);
        const {token} = this.props.login;
        WebSocketClientFactory.createNewClient(token);
    }

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

const mapStateToProps = state => ({
  login: { ...state.login },
});

export default connect(mapStateToProps)(App);
