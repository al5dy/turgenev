<?php
/**
 * Dependency-free unit/smoke tests for the API boundary.
 */

define( 'ABSPATH', __DIR__ . '/wordpress/' );
define( 'TURGENEV_VERSION', '2.0.0' );

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

require_once dirname( __DIR__, 2 ) . '/src/Support/OptionStore.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiException.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiClient.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/SettingsPage.php';

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
