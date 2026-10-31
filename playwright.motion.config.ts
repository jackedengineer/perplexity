import {defineConfig,devices} from '@playwright/test';
// Offline UI app. Never loads .env.local, sessions, Neon or provider credentials.
export default defineConfig({testDir:'./tests/e2e',testMatch:'answer-motion.spec.ts',
 outputDir:'.artifacts/answer-motion-results',workers:1,retries:0,forbidOnly:Boolean(process.env.CI),timeout:30000,
 use:{baseURL:'http://localhost:43741',trace:'retain-on-failure'},
 projects:[{name:'desktop',use:{...devices['Desktop Chrome']}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
 webServer:{command:'node node_modules/next/dist/bin/next dev tests/ui/answer-motion --hostname 127.0.0.1 --port 43741',url:'http://localhost:43741',reuseExistingServer:false,
  env:{OPENROUTER_API_KEY:'',TAVILY_API_KEY:'',DATABASE_URL:'postgresql://localhost/unused_motion_fixture',BETTER_AUTH_URL:'http://localhost:43741'}},
});
