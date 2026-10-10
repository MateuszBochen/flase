import React from 'react';
import ApplicationRendererContextInterface from '../../Interface/ApplicationRendererContextInterface';
import defaultApplicationRendererContext from './defaultApplicationRendererContext';

export const ApplicationRendererContext = React.createContext<ApplicationRendererContextInterface>(defaultApplicationRendererContext);
