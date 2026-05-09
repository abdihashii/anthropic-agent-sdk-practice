import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare global {
  namespace jest {
    interface Matchers<R, T = {}> extends TestingLibraryMatchers<T, R> {}
  }
}

declare module '@vitest/expect' {
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<unknown, unknown> {}
}
