module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/tests'],
    testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
    transform: {
        '^.+\\.[tj]s$': ['ts-jest', {
            tsconfig: 'tsconfig.json',
            isolatedModules: true,
            diagnostics: false,
        }],
    },
    transformIgnorePatterns: [
        'node_modules/(?!@faker-js/faker)',
    ],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
};
