import { AppRegistry } from 'react-native';
import App from './src/App';
import { runBackgroundCalendarSync } from './src/calendarSync';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
AppRegistry.registerHeadlessTask('HaksanCalendarSync', () => runBackgroundCalendarSync);
