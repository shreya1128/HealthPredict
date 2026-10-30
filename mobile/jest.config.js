module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Axios' "react-native" export condition resolves to its XHR build, which has no XHR in Node.
    // Tests (including the opt-in live-API test) use the Node build; the app itself is unaffected.
    '^axios$': 'axios/dist/node/axios.cjs',
  },
  testTimeout: 20_000,
  testPathIgnorePatterns: ['/node_modules/', '/.export-check/'],
};
