import {Observable} from 'rxjs';


class LoopThrough {
  static loop<Type>(object: { [key: symbol|string|number]: Type }):Observable<Type> {
    return new Observable((subscriber) => {
      Object.entries(object).forEach(([key, item]) => {
        subscriber.next(item);
      });
      subscriber.complete();
    });
  }
}

export default LoopThrough;
