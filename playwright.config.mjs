import { defineConfig } from '@playwright/test';

export default defineConfig( {
	testDir: './tests/e2e',
	fullyParallel: false,
	// Every spec drives one shared WordPress site: admin.spec.js rewrites and deletes the
	// stored API key that editor.spec.js analyzes with, so specs never run side by side.
	workers: 1,
	// Each WP-CLI call runs a fresh wp-env `cli` container (about 4 s), and a scenario makes
	// up to half a dozen of them around its browser steps.
	timeout: 90000,
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
