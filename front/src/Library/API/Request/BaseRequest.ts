import axios, {AxiosPromise} from 'axios';

/**
 * address of Flase server: REACT_APP_API_URL at build time, in development the server on port 3001,
 * in production build the same host the application was opened from (server serves the application)
 */
const apiUrl = (): string => {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/+$/, '');
  }
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:3001';
  }
  return window.location.origin;
};

class BaseRequest {
  static API_URL = apiUrl();
  static WS_URL = BaseRequest.API_URL.replace(/^http/, 'ws');
  static METHOD_POST = 'post';
  static METHOD_GET = 'get';
  static METHOD_DELETE = 'delete';
  static METHOD_PUT = 'put';
  static METHOD_PATCH = 'patch';
  static DEBUG_MODE = true;

  static STATUS_OK = 200;
  static STATUS_UNAUTHORIZED = 401;

  promiseDoRequest = (method: string, url: string, params: {[key:string]: any}):AxiosPromise => {

    return axios({
      method,
      url: `${BaseRequest.API_URL}${url}`,
      data: params,
    });
  };
}

export default BaseRequest;
