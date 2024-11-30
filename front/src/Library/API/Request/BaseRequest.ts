import axios, {AxiosPromise} from 'axios';

class BaseRequest {
  static API_URL = 'http://localhost:3001';
  static WS_URL = 'ws://localhost:3001';
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
