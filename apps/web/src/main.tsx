import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DemoAppProvider } from './state/DemoAppContext';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoAppProvider>
      <App />
    </DemoAppProvider>
  </StrictMode>,
);
