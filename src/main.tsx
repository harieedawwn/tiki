import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/700.css';
import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import './ui/styles.css';
import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { applyTheme, getSettings, subscribeSettings } from './data/settings';
import { initInstallCapture } from './ui/pwa';
import { initSfx } from './ui/sfx';

applyTheme(getSettings().theme);
subscribeSettings(() => applyTheme(getSettings().theme));
initSfx();
initInstallCapture();
registerSW({ immediate: true });
render(<App />, document.getElementById('app')!);
