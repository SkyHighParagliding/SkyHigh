import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ErrorBoundary} from './components/ErrorBoundary';
import { installDemoInterceptor } from './lib/demoInterceptor';
import App from './App.tsx';
import './index.css';

installDemoInterceptor();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
