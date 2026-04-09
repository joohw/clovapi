module.exports = {
  root: true,
  env: { browser: true, es2021: true, node: true },
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-hooks'],
  overrides: [
    {
      files: ['**/*.{js,jsx}'],
      rules: {
        'no-multiple-empty-lines': ['error', { max: 1 }],
      },
    },
  ],
};
