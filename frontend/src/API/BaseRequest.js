import axios from 'axios';

class BaseRequest {
    static API_URL = '';
    static METHOD_POST = 'post';
    static METHOD_GET = 'get';
    static METHOD_DELETE = 'delete';
    static METHOD_PUT = 'put';
    static METHOD_PATCH = 'patch';
    static DEBUG_MODE = true;

    static STATUS_OK = 200;
    static STATUS_UNAUTHORIZED = 401;

    promiseDoRequest = (method, url, params) => {
        let params2 = { ...params };
        let url2 = url;

        if (method === BaseRequest.METHOD_GET) {
            if (BaseRequest.DEBUG_MODE) {
                params2 = {
                    XDEBUG_SESSION_START: 'PHPSTORM',
                    ...params,
                };
            } else {
                params2 = {
                    ...params,
                };
            }

            const data = new URLSearchParams(params2).toString();
            url2 += `?${data}`;

        } else {
            if (BaseRequest.DEBUG_MODE) {
                params2 = {
                    XDEBUG_SESSION_START: 'PHPSTORM',
                };
                const data = new URLSearchParams(params2).toString();
                url2 += `?${data}`;
            }
        }



        return axios({
            method,
            url: `${BaseRequest.API_URL}${url2}`,
            data: params,
        });
    };
}

export default BaseRequest;
