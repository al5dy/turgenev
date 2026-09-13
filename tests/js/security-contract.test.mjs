import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve( import.meta.dirname, '../..' );

async function source( file ) {
	return readFile( resolve( root, file ), 'utf8' );
}

test( 'browser code never references a provider api_key field', async () => {
	for ( const file of [ 'src/js/client.js', 'src/js/classic.js', 'src/js/editor.js' ] ) {
		const text = await source( file );
		assert.equal( /api_key|apiKey/.test( text ), false, `${ file } must not contain the provider key` );
	}
} );

test( 'provider-controlled results are not assigned through innerHTML', async () => {
	for ( const file of [ 'src/js/client.js', 'src/js/classic.js', 'src/js/editor.js' ] ) {
		const text = await source( file );
		assert.equal( /\.innerHTML\s*=/.test( text ), false, `${ file } must not assign innerHTML` );
	}
} );

test( 'localized browser config contains nonce but no api key', async () => {
	const php = await source( 'src/Admin/EditorIntegration.php' );
	assert.match( php, /wp_create_nonce\( 'turgenev_api' \)/ );
	assert.doesNotMatch( php, /['"]api_key['"]\s*=>/ );
} );

test( 'ajax controller requires nonce and capability', async () => {
	const php = await source( 'src/Ajax/ApiController.php' );
	assert.match( php, /check_ajax_referer\( 'turgenev_api', 'nonce' \)/ );
	assert.match( php, /current_user_can\( 'edit_posts' \)/ );
	assert.match( php, /current_user_can\( 'manage_options' \)/ );
} );

test( 'editor UI is not hidden when the API key is missing', async () => {
	const php = await source( 'src/Admin/EditorIntegration.php' );
	const blockMethod = php.match( /public function enqueueBlockEditorAssets\(\): void \{([\s\S]*?)\n\t\}/ );
	assert.ok( blockMethod, 'block editor enqueue method must exist' );
	assert.doesNotMatch( blockMethod[ 1 ], /hasApiKey\(\).*return/s );
	assert.match( php, /'isConfigured'\s*=>\s*\$this->options->hasApiKey\(\)/ );
	assert.match( php, /Configure API key/ );
} );

test( 'classic editor metabox uses the active screen rather than post-type capability alone', async () => {
	const php = await source( 'src/Admin/EditorIntegration.php' );
	assert.match( php, /get_current_screen\(\)/ );
	assert.match( php, /\$screen->is_block_editor\(\)/ );
	assert.doesNotMatch( php, /use_block_editor_for_post_type/ );
} );

test( 'gutenberg adds Turgenev controls to the selected text block inspector', async () => {
	const js = await source( 'src/js/editor.js' );
	assert.match( js, /InspectorControls/ );
	assert.match( js, /editor\.BlockEdit/ );
	assert.match( js, /core\/paragraph/ );
	assert.match( js, /core\/block-editor/ );
	assert.match( js, /wp\.blocks\.serialize/ );
	assert.match( js, /Analyze selected block/ );
	assert.match( js, /topUpUrl/ );
} );
