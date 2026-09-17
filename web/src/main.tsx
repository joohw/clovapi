import { createRoot } from 'react-dom/client';
import { AppProvider } from './context';
import App from './App';
import '@fontsource-variable/outfit';
import './styles.css';

createRoot(document.getElementById('app')!).render(<AppProvider><App /></AppProvider>);
