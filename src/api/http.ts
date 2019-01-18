import * as request from 'request';
import { from, Observable } from 'rxjs';

const defaultHeaders = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/75.0.3770.142 Safari/537.36'
};

export class Http {
  static request<T>(method: string, url: string, options: any = {}): Observable<T> {
    return from(new Promise<T>((resolve, reject) => {
      const allHeaders = {
        ...defaultHeaders,
        ...options.headers,
      };

      const allOptions = {
        ...options,
        json: true,
        headers: allHeaders
      };

      request[method](url, allOptions, function(error, _, body) {
        const response = _.toJSON();

        if (error) {
          return reject(error);
        }

        if (response.statusCode >= 400) {
          console.log(`${method} ${url} - ${response.statusCode}`);
          return reject(response.body.message);
        }

        resolve(body);
      });
    }));
  }

  static get<T>(url: string, options?: any) {
    return Http.request<T>('get', url, options);
  }

  static post<T>(url: string, options: any) {
    return Http.request<T>('post', url, options);
  }

  static put<T>(url: string, options: any) {
    return Http.request<T>('put', url, options);
  }

  static delete<T>(url: string, options?: any) {
    return Http.request<T>('delete', url, options);
  }

  static head<T>(url: string, options?: any) {
    return Http.request<T>('head', url, options);
  }
}
