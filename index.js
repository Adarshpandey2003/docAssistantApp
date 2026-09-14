// Polyfills must land before anything pulls in mammoth / pdf-lib.
import './src/polyfills';

import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
