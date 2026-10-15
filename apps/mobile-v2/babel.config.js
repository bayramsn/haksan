module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
    // react-native-worklets/plugin reanimated 4 için zorunlu ve listede son olmalı.
    plugins: ['react-native-worklets/plugin'],
  };
};
