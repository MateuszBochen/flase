import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import LoginPage from './Pages/LoginPage/LoginPage';
import MainView from "./Pages/MainView/MainView";
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

class App extends Component {

  render() {
    const {host, login} = this.props.login;

    if (host || login) {
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
