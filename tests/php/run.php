<?php
/**
 * Dependency-free unit/smoke tests for the API boundary.
 */

define( 'ABSPATH', __DIR__ . '/wordpress/' );
define( 'TURGENEV_VERSION', '2.0.0' );
define( 'TURGENEV_DIR', dirname( __DIR__, 2 ) . '/' );
define( 'TURGENEV_URL', 'https://example.test/wp-content/plugins/turgenev/' );

$GLOBALS['turgenev_test_options'] = array();
$GLOBALS['turgenev_http_handler'] = null;
$GLOBALS['turgenev_last_request'] = null;
$GLOBALS['turgenev_settings_errors'] = array();

class WP_Error {
	public function __construct( private string $message ) {}
	public function get_error_message(): string { return $this->message; }
}

function __( string $text, string $domain = '' ): string { return $text; }
function get_option( string $name, $default = false ) { return $GLOBALS['turgenev_test_options'][ $name ] ?? $default; }
function home_url( string $path = '' ): string { return 'https://example.test' . $path; }
function sanitize_text_field( string $value ): string { return trim( strip_tags( $value ) ); }
function wp_unslash( $value ) { return $value; }
function esc_html( $value ): string { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
function add_settings_error( string $setting, string $code, string $message, string $type = 'error' ): void { $GLOBALS['turgenev_settings_errors'][] = compact( 'setting', 'code', 'message', 'type' ); }
function is_wp_error( $value ): bool { return $value instanceof WP_Error; }
function wp_remote_retrieve_response_code( array $response ): int { return (int) ( $response['response']['code'] ?? 0 ); }
function wp_remote_retrieve_body( array $response ): string { return (string) ( $response['body'] ?? '' ); }
function wp_remote_post( string $url, array $args ) {
	$GLOBALS['turgenev_last_request'] = array( 'url' => $url, 'args' => $args );
	$handler = $GLOBALS['turgenev_http_handler'];
	return $handler ? $handler( $url, $args ) : new WP_Error( 'No HTTP handler configured.' );
}

function is_admin(): bool { return true; }
function get_the_ID(): int { return 42; }
function admin_url( string $path ): string { return 'https://example.test/wp-admin/' . $path; }
function wp_create_nonce( string $action ): string { return 'test-nonce'; }
function wp_script_is( string $handle, string $status ): bool { return isset( $GLOBALS['test_scripts'][ $handle ] ); }
function wp_register_script( string $handle, string $src, array $deps, string $version, bool $footer ): void { $GLOBALS['test_scripts'][ $handle ] = compact( 'src', 'deps', 'version' ); }
function wp_enqueue_script( string $handle, string $src = '', array $deps = array(), string $version = '', bool $footer = false ): void { if ( $src ) { wp_register_script( $handle, $src, $deps, $version, $footer ); } }
function wp_register_style( string $handle, string $src, array $deps, string $version ): void { $GLOBALS['test_styles'][ $handle ] = compact( 'src', 'deps', 'version' ); }
function wp_enqueue_style( string $handle, string $src = '', array $deps = array(), string $version = '' ): void { if ( $src ) { wp_register_style( $handle, $src, $deps, $version ); } }
function wp_localize_script( string $handle, string $name, array $config ): void { $GLOBALS['test_localized'][ $handle ] = $config; }
function wp_set_script_translations( string $handle, string $domain, string $path ): void {}

require_once dirname( __DIR__, 2 ) . '/src/Support/OptionStore.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiException.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ResponseValidator.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ReportHighlightParser.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiClient.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/SettingsPage.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/EditorIntegration.php';
require_once dirname( __DIR__, 2 ) . '/src/Ajax/ApiController.php';

class JsonExit extends RuntimeException {
	public function __construct( public array $data, public int $status, public bool $success ) { parent::__construct( 'JSON response' ); }
}
function wp_send_json_success( array $data ): void { throw new JsonExit( $data, 200, true ); }
function wp_send_json_error( array $data, int $status ): void { throw new JsonExit( $data, $status, false ); }
function check_ajax_referer( string $action, string $field, bool $stop = true ) { return ( $_POST[ $field ] ?? '' ) === 'valid-nonce' ? 1 : false; }
function current_user_can( string $capability, ...$args ): bool { return in_array( $capability, $GLOBALS['test_caps'] ?? array(), true ); }
function absint( $value ): int { return abs( (int) $value ); }
function sanitize_key( string $value ): string { return preg_replace( '/[^a-z0-9_-]/', '', strtolower( $value ) ); }
function wp_strip_all_tags( string $value ): string { return strip_tags( $value ); }
function fixture_analysis(): array {
	$result = array( 'risk' => '4', 'level' => 'low', 'link' => 'risk12345', 'details' => array_map( static fn( $block ) => array( 'block' => $block, 'sum' => '1', 'link' => $block . '12345', 'params' => array() ), Al5dy\Turgenev\Api\ResponseValidator::SECTIONS ) );
	$result['details'][0]['params'] = array(
		array( 'name' => 'Сверхчастые слова', 'value' => 'Нет', 'score' => '0' ),
	);
	return $result;
}
function respond( $data ): void {
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => json_encode( $data ) );
}

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Api\ApiException;
use Al5dy\Turgenev\Admin\SettingsPage;
use Al5dy\Turgenev\Support\OptionStore;

$tests = 0;

function expect_true( bool $condition, string $message ): void {
	global $tests;
	++$tests;
	if ( ! $condition ) {
		throw new RuntimeException( 'FAIL: ' . $message );
	}
}

function expect_exception( callable $callback, string $contains ): void {
	global $tests;
	++$tests;
	try {
		$callback();
	} catch ( ApiException $exception ) {
		if ( false === strpos( $exception->getMessage(), $contains ) ) {
			throw new RuntimeException( 'FAIL: expected exception containing "' . $contains . '", got "' . $exception->getMessage() . '".' );
		}
		return;
	}
	throw new RuntimeException( 'FAIL: expected ApiException.' );
}

try {
	$integration = new Al5dy\Turgenev\Admin\EditorIntegration( new OptionStore() );
	$integration->enqueueBlockEditorAssets();
	$integration->enqueueCanvasStyles();
	expect_true( ApiClient::REPORT_BASE_URL === $GLOBALS['test_localized']['turgenev-client']['reportBaseUrl'], 'editor bootstrap resolves report URL at runtime' );
	expect_true( in_array( 'turgenev-editor-content', $GLOBALS['test_scripts']['turgenev-editor']['deps'], true ), 'editor loads its content adapter before rendering' );
	expect_true( isset( $GLOBALS['test_styles']['turgenev-canvas'] ), 'highlight colors load inside the editor iframe' );
	foreach ( $GLOBALS['test_scripts'] as $script ) {
		expect_true( is_file( TURGENEV_DIR . substr( $script['src'], strlen( TURGENEV_URL ) ) ), 'every enqueued runtime asset exists' );
	}

	$GLOBALS['turgenev_test_options']['turgenev'] = array( 'api_key' => 'saved-secret' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"balance":"42.50"}' );
	$client = new ApiClient( new OptionStore() );
	expect_true( '42.50' === $client->balance(), 'balance response is returned' );
	expect_true( 'saved-secret' === $GLOBALS['turgenev_last_request']['args']['body']['key'], 'saved key is sent server-side' );
	expect_true( 'balance' === $GLOBALS['turgenev_last_request']['args']['body']['api'], 'balance operation is selected' );

	respond( fixture_analysis() );
	$result = $client->analyze( 'Useful test content.' );
	expect_true( '4' === $result['risk'], 'risk response is returned' );
	expect_true( '1' === $GLOBALS['turgenev_last_request']['args']['body']['more'], 'extended result flag is sent' );
	expect_true( 'Useful test content.' === $GLOBALS['turgenev_last_request']['args']['body']['text'], 'analysis text is sent intact' );
	expect_true( 'Нет' === $result['details'][0]['params'][0]['value'], 'textual parameter values do not invalidate a complete analysis' );

	foreach ( array( 'Нет', '12.5%', '1,25', '0.123456789012345', '—', 0, 15.9, 0.123456789012345, '<b>Нет</b>' ) as $value ) {
		$fixture = fixture_analysis();
		$fixture['details'][0]['params'][0]['value'] = $value;
		respond( $fixture );
		$result = $client->analyze( 'Useful test content.' );
		expect_true( sanitize_text_field( (string) $value ) === $result['details'][0]['params'][0]['value'], 'display values preserve text, formatting and precision as sanitized strings' );
	}
	foreach ( array( null, true, false, array(), (object) array( 'value' => 1 ), '', '  ', '<b></b>', str_repeat( 'a', 1001 ) ) as $value ) {
		$fixture = fixture_analysis();
		$fixture['details'][0]['params'][0]['value'] = $value;
		respond( $fixture );
		expect_exception( static fn() => $client->analyze( 'text' ), 'invalid analysis' );
	}
	foreach ( array( NAN, INF, -INF ) as $value ) {
		$fixture = fixture_analysis();
		$fixture['details'][0]['params'][0]['value'] = $value;
		expect_exception( static fn() => Al5dy\Turgenev\Api\ResponseValidator::analysis( $fixture ), 'invalid analysis' );
	}
	foreach ( array( 'Нет', '12.5%', '1,25', true, array() ) as $value ) {
		foreach ( array( 'risk', 'sum', 'score', 'balance' ) as $field ) {
			$fixture = fixture_analysis();
			if ( 'risk' === $field ) { $fixture['risk'] = $value; }
			if ( 'sum' === $field ) { $fixture['details'][0]['sum'] = $value; }
			if ( 'score' === $field ) { $fixture['details'][0]['params'][0]['score'] = $value; }
			if ( 'balance' === $field ) { $fixture = array( 'balance' => $value ); }
			respond( $fixture );
			expect_exception( static fn() => 'balance' === $field ? $client->balance() : $client->analyze( 'text' ), 'balance' === $field ? 'invalid balance' : 'invalid numeric' );
		}
	}

	$report_markup = '<html><body><textarea id="textfield"><p>Text <span class="xhl slop2 xhint xhint-1-1">with style</span> here.</p></textarea></body></html>';
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
	$highlights = $client->reportHighlights( 'abc12345', 'Text with style here.' );
	expect_true( 'Text with style here.' === $highlights['text'], 'report highlight text matches the analyzed block' );
	expect_true( 1 === count( $highlights['marks'] ), 'highlighted report span becomes one safe mark' );
	expect_true( 5 === $highlights['marks'][0]['start'] && 15 === $highlights['marks'][0]['end'], 'highlight offsets use browser-compatible UTF-16 positions' );
	expect_true( 'style' === $highlights['marks'][0]['category'] && 2 === $highlights['marks'][0]['level'], 'highlight category and level are extracted from classes' );
	expect_true( 'https://turgenev.ashmanov.com/' === $GLOBALS['turgenev_last_request']['url'], 'report is requested from the fixed provider endpoint' );
	expect_true( 'abc12345' === $GLOBALS['turgenev_last_request']['args']['body']['t'], 'report reference is sent using the provider POST form' );
	expect_true( false === isset( $GLOBALS['turgenev_last_request']['args']['body']['key'] ), 'report retrieval never sends the API key' );
	expect_exception( static fn() => $client->reportHighlights( 'invalid report URL', 'Text with style here.' ), 'reference is invalid' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
	expect_exception( static fn() => $client->reportHighlights( 'abc12345', 'Different text.' ), 'does not match' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{not-json' );
	expect_exception( static fn() => $client->balance(), 'malformed JSON' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"error":"Bad key"}' );
	expect_exception( static fn() => $client->balance(), 'rejected' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 503 ), 'body' => '{}' );
	expect_exception( static fn() => $client->balance(), 'HTTP 503' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"balance":"not-a-number"}' );
	expect_exception( static fn() => $client->balance(), 'invalid balance' );

	expect_exception( static fn() => $client->request( 'delete-account' ), 'Unsupported' );
	expect_exception( static fn() => $client->analyze( str_repeat( 'a', ApiClient::MAX_TEXT_LENGTH + 1 ) ), 'up to' );

	$GLOBALS['turgenev_test_options']['turgenev'] = array();
	$no_key = new ApiClient( new OptionStore() );
	expect_exception( static fn() => $no_key->balance(), 'Configure' );

	$override = new ApiClient( new OptionStore(), 'candidate-secret' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"balance":"1"}' );
	$override->balance();
	expect_true( 'candidate-secret' === $GLOBALS['turgenev_last_request']['args']['body']['key'], 'candidate key override is supported for validation' );

	// Settings regression tests: keep, rotate, reject and clear the secret predictably.
	$GLOBALS['turgenev_test_options']['turgenev'] = array( 'api_key' => 'working-key' );
	$store = new OptionStore();
	$settings = new SettingsPage( $store );
	$kept = $settings->sanitizeSettings( array( 'api_key' => '' ) );
	expect_true( 'working-key' === $kept['api_key'], 'blank settings field preserves the saved key' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"error":"Invalid key"}' );
	$rejected = $settings->sanitizeSettings( array( 'api_key' => 'bad-replacement' ) );
	expect_true( 'working-key' === $rejected['api_key'], 'invalid replacement does not destroy saved key' );

	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"balance":"9.75"}' );
	$rotated = $settings->sanitizeSettings( array( 'api_key' => 'new-working-key' ) );
	expect_true( 'new-working-key' === $rotated['api_key'], 'validated replacement key is saved' );
	expect_true( 'balance' === $GLOBALS['turgenev_last_request']['args']['body']['api'], 'settings validate key through balance endpoint' );

	$cleared = $settings->sanitizeSettings( array( 'clear_api_key' => '1' ) );
	expect_true( array() === $cleared, 'explicit clear removes saved key' );

	expect_true( '••••••••-key' === $store->maskedApiKey(), 'masked key never returns the full secret' );

	foreach ( array( null, true, array(), 'NaN', 'INF', '1e4', ' 1 ', '1.1.1' ) as $invalid ) {
		respond( array( 'balance' => $invalid ) );
		expect_exception( static fn() => $client->balance(), 'invalid balance' );
	}
	foreach ( array( array(), array( 'risk' => 1 ), array( 'error' => null ), array( 'error' => array( 'secret' => 'working-key' ) ) ) as $invalid ) {
		respond( $invalid );
		expect_exception( static fn() => $client->analyze( 'text' ), '' );
	}
	foreach ( array( 'risk', 'level', 'link', 'details' ) as $field ) {
		$invalid = fixture_analysis(); unset( $invalid[ $field ] ); respond( $invalid );
		expect_exception( static fn() => $client->analyze( 'text' ), 'incomplete' );
	}
	$invalid = fixture_analysis(); $invalid['details'][1] = $invalid['details'][0]; respond( $invalid );
	expect_exception( static fn() => $client->analyze( 'text' ), 'section' );
	$invalid = fixture_analysis(); $invalid['details'][0]['params'] = array( array( 'name' => 'parameter' ) ); respond( $invalid );
	expect_exception( static fn() => $client->analyze( 'text' ), 'parameters' );
	respond( array( 'error' => 'working-key' ) );
	try { $client->balance(); } catch ( ApiException $error ) { expect_true( ! str_contains( $error->getMessage(), 'working-key' ), 'provider error never reflects key' ); }
	$GLOBALS['turgenev_http_handler'] = static fn() => new WP_Error( 'working-key' );
	try { $client->balance(); } catch ( ApiException $error ) { expect_true( ! str_contains( $error->getMessage(), 'working-key' ), 'transport error never reflects key' ); }
	$fixture = fixture_analysis(); $fixture['secret'] = 'working-key'; $fixture['level'] = 'working-key';
	$fixture['details'][0]['params'][0]['value'] = 'working-key'; respond( $fixture );
	$safe = $client->analyze( 'text' );
	expect_true( ! str_contains( json_encode( $safe ), 'working-key' ) && ! isset( $safe['secret'] ), 'allowlisted response does not expose secrets or unknown fields' );
	expect_true( 0 === $GLOBALS['turgenev_last_request']['args']['redirection'], 'key cannot follow redirects' );
	expect_true( isset( $GLOBALS['turgenev_last_request']['args']['limit_response_size'] ), 'HTTP response size is bounded before buffering' );
	expect_exception( static fn() => $client->analyze( '' ), 'no content' );
	expect_exception( static fn() => $client->analyze( "a\0b" ), 'encoding' );
	expect_exception( static fn() => $client->analyze( "\xFF" ), 'encoding' );
	respond( fixture_analysis() );
	$client->analyze( str_repeat( '😀', ApiClient::MAX_TEXT_LENGTH ) );
	expect_true( strlen( $GLOBALS['turgenev_last_request']['args']['body']['text'] ) === ApiClient::MAX_TEXT_LENGTH * 4, 'Unicode payload at limit is not truncated' );
	expect_exception( static fn() => $client->analyze( str_repeat( '😀', ApiClient::MAX_TEXT_LENGTH + 1 ) ), 'up to' );
	$GLOBALS['turgenev_test_options']['turgenev'] = array( 'api_key' => 'tiny' );
	expect_true( ! str_contains( $store->maskedApiKey(), 'tiny' ), 'short keys are not exposed by masking' );
	$GLOBALS['turgenev_test_options']['turgenev'] = array( 'api_key' => 'working-key' );

	$controller = new Al5dy\Turgenev\Ajax\ApiController( $client );
	$cases = array(
		array( array(), array(), 403 ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text' ), array(), 403 ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => array( 'risk' ) ), array( 'edit_posts' ), 400 ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' ), array( 'edit_posts' ), 403 ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' ), array( 'edit_post' ), 200 ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => array( 'Text' ) ), array( 'edit_posts' ), 502 ),
	);
	foreach ( $cases as [ $post, $caps, $status ] ) {
		$_POST = $post; $GLOBALS['test_caps'] = $caps; $GLOBALS['turgenev_last_request'] = null;
		respond( fixture_analysis() );
		try { $controller->handle(); throw new RuntimeException( 'Controller did not return JSON.' ); }
		catch ( JsonExit $response ) {
			expect_true( $response->status === $status, 'AJAX validates nonce, capability, CPT permissions and scalar inputs' );
			if ( 200 === $status ) { expect_true( 'Нет' === $response->data['result']['details'][0]['params'][0]['value'], 'AJAX returns validated textual measurements to the editor' ); }
			if ( in_array( $status, array( 400, 403 ), true ) ) { expect_true( null === $GLOBALS['turgenev_last_request'], 'rejected request never reaches paid API' ); }
		}
	}

	$parser = new Al5dy\Turgenev\Api\ReportHighlightParser();
	$unicode = $parser->parse( '<textarea id="textfield"><p>😀 <span class="xhl slop2">слово</span></p><p>далее &lt;текст&gt;</p></textarea>', '😀 слово далее <текст>' );
	expect_true( 3 === $unicode['marks'][0]['start'] && 8 === $unicode['marks'][0]['end'], 'Unicode offsets and paragraph boundaries are correct' );
	$blocks = $parser->parse( '<textarea id="textfield"><p>one</p><p><span class="xhl fog1">two</span></p></textarea>', 'one two' );
	expect_true( 4 === $blocks['marks'][0]['start'], 'adjacent HTML block elements are separated' );
	$dense = $parser->parse( '<textarea id="textfield"><p>' . str_repeat( '<span class="xhl slop2">текст</span> ', 700 ) . '</p></textarea>', trim( str_repeat( 'текст ', 700 ) ) );
	expect_true( 700 === count( $dense['marks'] ), 'long valid documents retain every provider highlight beyond the old 500-mark limit' );
	expect_true( 4194 === $dense['marks'][699]['start'], 'dense report offsets remain exact through the final fragment' );
	$sections = $parser->parse( '<textarea id="textfield"><section><span class="xhl slop2">one</span></section><section><span class="xhl slop2">two</span></section></textarea>', 'one two' );
	expect_true( 4 === $sections['marks'][1]['start'], 'HTML section boundaries match the editor whitespace model' );
	$bom = $parser->parse( "<textarea id=\"textfield\"><p>\u{FEFF}<span class=\"xhl slop2\">😀 слово</span>\u{FEFF}</p></textarea>", '😀 слово' );
	expect_true( 0 === $bom['marks'][0]['start'] && 8 === $bom['marks'][0]['end'], 'editor zero-width no-break spaces do not shift UTF-16 highlights' );

	echo 'PHP smoke tests passed: ' . $tests . PHP_EOL;
} catch ( Throwable $exception ) {
	fwrite( STDERR, $exception->getMessage() . PHP_EOL );
	exit( 1 );
}
