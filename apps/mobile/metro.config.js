const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  projectRoot,
  watchFolders: [
    path.join(workspaceRoot, 'packages'),
    path.join(workspaceRoot, 'src/shared'),
    path.join(workspaceRoot, 'node_modules'),
  ],
  resolver: {
    nodeModulesPaths: [
      path.join(projectRoot, 'node_modules'),
      path.join(workspaceRoot, 'node_modules'),
    ],
    unstable_enablePackageExports: true,
  },
});
