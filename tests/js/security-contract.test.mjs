import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve( import.meta.dirname, '../..' );

async function source( file ) {
	return readFile( resolve( root, file ), 'utf8' );
}

test( 'browser code never references a provider api_key field', async () => {
	for ( const file of [ 'resources/ts/client.ts', 'resources/ts/content-reset.ts', 'resources/ts/classic.ts', 'resources/ts/editor.ts', 'resources/ts/editor-content.ts', 'resources/ts/analysis.ts', 'resources/ts/highlights.ts' ] ) {
		const text = await source( file );
		assert.equal( /api_key|apiKey/.test( text ), false, `${ file } must not contain the provider key` );
	}
} );

test( 'provider-controlled results are not assigned through innerHTML', async () => {
	for ( const file of [ 'resources/ts/client.ts', 'resources/ts/content-reset.ts', 'resources/ts/classic.ts', 'resources/ts/editor.ts', 'resources/ts/editor-content.ts', 'resources/ts/analysis.ts', 'resources/ts/highlights.ts' ] ) {
		const text = await source( file );
		assert.equal( /\.innerHTML\s*=/.test( text ), false, `${ file } must not assign innerHTML` );
		assert.equal( /dangerouslySetInnerHTML/.test( text ), false, `${ file } must not use dangerouslySetInnerHTML` );
	}
} );

test( 'highlights have no write path to block attributes, editor DOM or rich-text formats', async () => {
	const parser = await source( 'src/Api/ReportHighlightParser.php' );
	const controller = await source( 'src/Ajax/ApiController.php' );
	const client = await source( 'resources/ts/client.ts' );
	const editor = await source( 'resources/ts/editor.ts' );
	const content = await source( 'resources/ts/editor-content.ts' );
	assert.match( parser, /DOMDocument/ );
	assert.match( parser, /report text does not match/i );
	assert.match( controller, /'highlights'/ );
	assert.match( controller, /reportHighlights/ );
	const decorations = await source( 'resources/ts/highlights.ts' );
	const session = await source( 'resources/ts/analysis.ts' );
	for ( const text of [ client, editor, content, decorations, session ] ) {
		assert.doesNotMatch( text, /updateBlockAttributes|applyFormat|registerFormatType|editPost|insertBlocks|setContent\s*\(/ );
	}
	assert.match( decorations, /CSS\.highlights/ );
	assert.match( decorations, /documentElement\.appendChild/ );
	assert.match( client, /appendReportActions/ );
	assert.doesNotMatch( client, /renderHighlights/ );
	assert.doesNotMatch( client, /Highlights preview/ );
	assert.match( session, /Reset view/ );
	assert.match( editor, /useRegistry/ );
	assert.match( content, /getEditedPostContent/ );
} );

test( 'localized browser config contains nonce but no api key', async () => {
	const php = await source( 'src/Admin/EditorIntegration.php' );
	assert.match( php, /wp_create_nonce\( 'turgenev_api' \)/ );
	assert.doesNotMatch( php, /['"]api_key['"]\s*=>/ );
} );

test( 'ajax controller requires nonce and capability', async () => {
	const php = await source( 'src/Ajax/ApiController.php' );
	assert.match( php, /check_ajax_referer\( 'turgenev_api', 'nonce', false \)/ );
	assert.match( php, /current_user_can\( 'edit_post', \$post_id \)/ );
	assert.match( php, /current_user_can\( 'manage_options' \)/ );
} );

test( 'risk and highlights never fall back to the generic edit_posts capability', async () => {
	const php = await source( 'src/Ajax/ApiController.php' );
	assert.doesNotMatch( php, /edit_posts/ );
	assert.match( php, /! \$post_id \|\| ! \$post/ );
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

test( 'gutenberg uses an independent toolbar-triggered overlay, not a document settings tab, and stays independent of block selection', async () => {
	const js = await source( 'resources/ts/editor.ts' );
	const content = await source( 'resources/ts/editor-content.ts' );
	assert.doesNotMatch( js, /PluginDocumentSettingPanel/ );
	assert.match( js, /registerPlugin/ );
	assert.match( js, /editor-document-tools\.edit-post-header-toolbar/ );
	assert.match( js, /interface-interface-skeleton__sidebar/ );
	assert.match( content, /core\/editor/ );
	assert.doesNotMatch( js, /isSelected|selectedBlock|InspectorControls/ );
	const session = await source( 'resources/ts/analysis.ts' );
	assert.match( session, /Analyze document/ );
	assert.match( session, /topUpUrl/ );
} );
