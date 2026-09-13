import { expect, test } from '@playwright/test';

const username = process.env.WP_ADMIN_USER;
const password = process.env.WP_ADMIN_PASSWORD;

async function login( page ) {
	test.skip( ! username || ! password, 'WP_ADMIN_USER and WP_ADMIN_PASSWORD are required.' );
	await page.goto( '/wp-login.php' );
	await page.getByLabel( /Username|Email Address/i ).fill( username );
	await page.getByLabel( /Password/i ).fill( password );
	await page.getByRole( 'button', { name: /Log In/i } ).click();
	await page.waitForURL( /wp-admin/ );
}

test( 'settings page loads without exposing a configured secret', async ( { page } ) => {
	await login( page );
	await page.goto( '/wp-admin/options-general.php?page=turgenev-settings' );
	await expect( page.getByRole( 'heading', { name: /Turgenev/i } ) ).toBeVisible();
	await expect( page.locator( '#turgenev-api-key' ) ).toHaveAttribute( 'type', 'password' );

	const secret = process.env.TURGENEV_API_KEY;
	if ( secret ) {
		const html = await page.content();
		expect( html ).not.toContain( secret );
	}
} );
