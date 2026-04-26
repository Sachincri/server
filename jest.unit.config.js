module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/tests/unit/utils/**/*.test.ts',
        '<rootDir>/tests/unit/security/**/*.test.ts',
    ],
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            isolatedModules: true,
            diagnostics: false,
        }],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^expo-server-sdk$': '<rootDir>/tests/mocks/expo-server-sdk.ts',
    },
    testTimeout: 30000,
};
