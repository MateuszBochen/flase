/** answer of the server - shape of the former axios response, callers read data and status */
export interface ApiResponseInterface<T = any> {
  data: T;
  status: number;
}

/** rejected request (status other than 2xx) - callers read response.data.error / response.status */
export class ApiRequestError extends Error {
  constructor(message: string, public readonly response: ApiResponseInterface) {
    super(message);
  }
}

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

  promiseDoRequest = async (method: string, url: string, params: {[key:string]: any}): Promise<ApiResponseInterface> => {
    const withBody = method !== BaseRequest.METHOD_GET;
    const response = await fetch(`${BaseRequest.API_URL}${url}`, {
      method: method.toUpperCase(),
      headers: withBody ? {'Content-Type': 'application/json'} : undefined,
      body: withBody ? JSON.stringify(params) : undefined,
    });
    const text = await response.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      // not JSON - text as it is
    }
    if (!response.ok) {
      throw new ApiRequestError(`Request failed with status code ${response.status}`, {data, status: response.status});
    }
    return {data, status: response.status};
  };
}

export default BaseRequest;
