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
require_once dirname( __DIR__, 2 ) . '/src/Api/ReportHighlightParser.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiClient.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/SettingsPage.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/EditorIntegration.php';

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

	$GLOBALS['turgenev_http_handler'] = static fn() => array(
		'response' => array( 'code' => 200 ),
		'body' => '{"link":"abc","risk":"4","level":"low","details":[]}',
	);
	$result = $client->analyze( 'Useful test content.' );
	expect_true( '4' === $result['risk'], 'risk response is returned' );
	expect_true( '1' === $GLOBALS['turgenev_last_request']['args']['body']['more'], 'extended result flag is sent' );
	expect_true( 'Useful test content.' === $GLOBALS['turgenev_last_request']['args']['body']['text'], 'analysis text is sent intact' );

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
	expect_exception( static fn() => $client->balance(), 'Bad key' );

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

	echo 'PHP smoke tests passed: ' . $tests . PHP_EOL;
} catch ( Throwable $exception ) {
	fwrite( STDERR, $exception->getMessage() . PHP_EOL );
	exit( 1 );
}
