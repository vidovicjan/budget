import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '../../src/styles.css';
import './mobile.css';
import App from '../../src/App';
import { applySavedTheme } from '../../src/lib/theme';
import { installPlatform } from './platform';
import { MobileShell } from './MobileShell';

installPlatform();
applySavedTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileShell>
      <App />
    </MobileShell>
  </StrictMode>
);
