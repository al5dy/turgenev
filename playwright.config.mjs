import { defineConfig } from '@playwright/test';

export default defineConfig( {
	testDir: './tests/e2e',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: process.env.WP_BASE_URL || 'http://localhost:8888',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [ { name: 'chromium', use: { browserName: 'chromium' } } ],
} );
