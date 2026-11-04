import {defineConfig} from '@playwright/test';
import search from './playwright.search.config';
export default defineConfig({...search,testMatch:['**/local-safety.spec.ts','**/guarded-search.spec.ts','**/guest-trials.spec.ts','**/recovery.spec.ts','**/distributed-controls.spec.ts'],outputDir:'.artifacts/identity-safety/browser-results'});
