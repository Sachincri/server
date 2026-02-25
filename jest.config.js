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
    collectCoverage: false, // Enable in CI: jest --coverage
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/utils/createIndexes.ts',
        '!src/types/**',
    ],
    coverageThresholds: {
        global: {
            lines: 60,
            functions: 60,
            branches: 40,
            statements: 60,
        },
    },
};
