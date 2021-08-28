import {Component} from "react";
import {Col, Form, Row} from 'react-bootstrap';
import './style.css';
import LoadingButton from '../../Components/Buttons/LoadingButton';
import LoginRequest from '../../API/LoginRequest';
import BaseRequest from '../../API/BaseRequest';
import LoginAction from '../../Actions/LoginAction';

class LoginPage extends Component {
    constructor(props) {
        super(props);
        this.loginReqeust = new LoginRequest();
        this.loginAction = new LoginAction();
        this.state = {
            host: '',
            login: '',
            password: '',
            loading: false,
            responseCode: '',
            responseMessage: '',
        };
    }

    onChangeHandler = (name, value) => {
        // eslint-disable-next-line default-case
        switch (name) {
            case 'host':
                this.setState({
                  host: value,
                });
                break;
            case 'login':
                this.setState({
                  login: value,
                });
                break;
            case 'password':
                this.setState({
                    password: value,
                });
                break;
        }
    }

    login = () => {
        this.setState({loading: true});
        const { host, login, password } = this.state;
        this.loginReqeust
            .login(host, login, password)
            .then((response) => {
               if (response.status === BaseRequest.STATUS_OK) {
                    this.setState({
                        responseCode: 'ok',
                        responseMessage: '',
                    });
                    this.loginAction
                        .setLogin(response.data.token);

                } else {
                    this.setState({
                        responseCode: 'error',
                        responseMessage: response.data.message,
                    });
                }

                this.setState({loading: false});

            })
            .catch((error) => {
                this.setState({
                    responseCode: 'error',
                    responseMessage: '',
                    loading: false,
                });

            });
    }

    render() {
        const { host, login, password, loading, responseMessage, responseCode } = this.state;

        const errorClass = responseCode === 'error' ? 'error' : 'ok';

        return (
            <div className="login-main">
                <div className={`login-window ${errorClass}`}>
                    <div className="login-window-header">
                        Flase Data Base Manager
                    </div>
                    <Form>
                        <Form.Group as={Row} controlId="formPlaintextHost">
                            <Form.Label column sm="2">
                                Host:
                            </Form.Label>
                            <Col sm="10">
                                <Form.Control
                                    value={host}
                                    onChange={(e) => this.onChangeHandler('host', e.target.value)}
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row} controlId="formPlaintextEmail">
                            <Form.Label column sm="2">
                                Login:
                            </Form.Label>
                            <Col sm="10">
                                <Form.Control
                                    value={login}
                                    onChange={(e) => this.onChangeHandler('login', e.target.value)}
                                />
                            </Col>
                        </Form.Group>
                        <Form.Group as={Row} controlId="formPlaintextPassword">
                            <Form.Label column sm="2">
                                Password:
                            </Form.Label>
                            <Col sm="10">
                                <Form.Control
                                    type="password"
                                    value={password}
                                    onChange={(e) => this.onChangeHandler('password', e.target.value)}
                                />
                            </Col>
                        </Form.Group>
                        <LoadingButton
                            variant="secondary"
                            loading={loading}
                            onClick={this.login}
                        >
                            Login
                        </LoadingButton>
                        <div>
                            {responseMessage}
                        </div>
                    </Form>
                </div>
            </div>
        );
    }
}

export default LoginPage;
