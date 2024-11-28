import thunk from 'redux-thunk';
import { createStore, applyMiddleware, compose } from 'redux';
import CombineReducers from './Reducers/CombineReducers';

const middleware = applyMiddleware(thunk);

const enhancer = compose(
  middleware,
);

const store = createStore(CombineReducers, enhancer);

export default store;
