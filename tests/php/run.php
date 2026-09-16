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
$GLOBALS['turgenev_remote_post_calls'] = 0;
$GLOBALS['turgenev_cap_calls'] = array();
$GLOBALS['turgenev_test_transients'] = array();

class WP_Error {
	public function __construct( private string $message ) {}
	public function get_error_message(): string { return $this->message; }
}

function __( string $text, string $domain = '' ): string { return $text; }
function get_option( string $name, $default = false ) { return $GLOBALS['turgenev_test_options'][ $name ] ?? $default; }
function sanitize_text_field( string $value ): string { return trim( strip_tags( $value ) ); }
function wp_unslash( $value ) { return $value; }
function esc_html( $value ): string { return htmlspecialchars( (string) $value, ENT_QUOTES, 'UTF-8' ); }
function add_settings_error( string $setting, string $code, string $message, string $type = 'error' ): void { $GLOBALS['turgenev_settings_errors'][] = compact( 'setting', 'code', 'message', 'type' ); }
function is_wp_error( $value ): bool { return $value instanceof WP_Error; }
function wp_remote_retrieve_response_code( array $response ): int { return (int) ( $response['response']['code'] ?? 0 ); }
function wp_remote_retrieve_body( array $response ): string { return (string) ( $response['body'] ?? '' ); }
function wp_remote_post( string $url, array $args ) {
	++$GLOBALS['turgenev_remote_post_calls'];
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
function get_current_user_id(): int { return $GLOBALS['test_user_id'] ?? 7; }
function get_transient( string $key ) { return $GLOBALS['turgenev_test_transients'][ $key ] ?? false; }
function set_transient( string $key, $value, int $expiration = 0 ): bool { $GLOBALS['turgenev_test_transients'][ $key ] = $value; return true; }
function delete_transient( string $key ): bool { unset( $GLOBALS['turgenev_test_transients'][ $key ] ); return true; }
function add_filter( string $tag, callable $callback, int $priority = 10, int $accepted_args = 1 ): void { $GLOBALS['turgenev_test_filters'][ $tag ][] = $callback; }
function apply_filters( string $tag, $value, ...$args ) {
	foreach ( $GLOBALS['turgenev_test_filters'][ $tag ] ?? array() as $callback ) {
		$value = $callback( $value, ...$args );
	}
	return $value;
}

require_once dirname( __DIR__, 2 ) . '/src/Support/OptionStore.php';
require_once dirname( __DIR__, 2 ) . '/src/Support/RateLimiter.php';
require_once dirname( __DIR__, 2 ) . '/src/Support/Requirements.php';
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
/**
 * $GLOBALS['test_caps'] holds grants, each either a bare capability name (matches only a
 * call with no object arguments, e.g. 'edit_posts', 'manage_options') or an array of
 * [ capability, ...objectArgs ] (matches only a call for that exact object, e.g. object ID).
 * A grant for 'edit_post' on one post ID must never authorize a call for a different one.
 */
function current_user_can( string $capability, ...$args ): bool {
	$GLOBALS['turgenev_cap_calls'][] = array( $capability, $args );
	foreach ( $GLOBALS['test_caps'] ?? array() as $grant ) {
		$granted_capability = is_array( $grant ) ? $grant[0] : $grant;
		$granted_args       = is_array( $grant ) ? array_slice( $grant, 1 ) : array();
		if ( $granted_capability === $capability && $granted_args === $args ) {
			return true;
		}
	}
	return false;
}
function get_post( int $post_id ) { return in_array( $post_id, $GLOBALS['test_posts'] ?? array( 42 ), true ) ? (object) array( 'ID' => $post_id ) : null; }
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
function respond_html( string $markup ): void {
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $markup );
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
	expect_true( 'Turgenev-WordPress/' . TURGENEV_VERSION === $GLOBALS['turgenev_last_request']['args']['headers']['User-Agent'], 'User-Agent never includes the site URL or any other site-identifying data' );

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
	expect_true( 'Turgenev-WordPress/' . TURGENEV_VERSION === $GLOBALS['turgenev_last_request']['args']['headers']['User-Agent'], 'report retrieval User-Agent never includes the site URL or any other site-identifying data' );
	expect_exception( static fn() => $client->reportHighlights( 'invalid report URL', 'Text with style here.' ), 'reference is invalid' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
	expect_exception( static fn() => $client->reportHighlights( 'abc12345', 'Different text.' ), 'does not match' );

	// --- Capability-disabled scenario: highlight rendering degrades without ext-dom. ---
	// This forces the same code path a missing DOM extension would take, so this suite never
	// depends on whether ext-dom actually happens to be installed on the machine running it.
	expect_true( true === Al5dy\Turgenev\Support\Requirements::hasDom(), 'sanity check: this test environment has ext-dom (the default this suite would otherwise depend on)' );

	$no_dom_parser = new Al5dy\Turgenev\Api\ReportHighlightParser( false );
	expect_exception( static fn() => $no_dom_parser->parse( $report_markup, 'Text with style here.' ), 'unavailable' );

	$forced_dom_parser = new Al5dy\Turgenev\Api\ReportHighlightParser( true );
	$still_parses       = $forced_dom_parser->parse( $report_markup, 'Text with style here.' );
	expect_true( 'Text with style here.' === $still_parses['text'], 'forcing has_dom=true still parses normally (the override is not one-directional)' );

	// The browser must be told, so it can hide the Highlight action instead of offering one
	// that is guaranteed to fail.
	$integration = new Al5dy\Turgenev\Admin\EditorIntegration( new OptionStore() );
	$integration->enqueueBlockEditorAssets();
	expect_true( true === $GLOBALS['test_localized']['turgenev-client']['highlightsAvailable'], 'browser config reports the real (available) highlight capability by default' );

	$GLOBALS['test_scripts'] = array();
	$no_dom_integration      = new Al5dy\Turgenev\Admin\EditorIntegration( new OptionStore(), false );
	$no_dom_integration->enqueueBlockEditorAssets();
	expect_true( false === $GLOBALS['test_localized']['turgenev-client']['highlightsAvailable'], 'browser config reports highlights as unavailable when the capability is forced off' );

	// Balance and risk analysis never touch ReportHighlightParser, so they are unaffected
	// regardless of highlight availability.
	respond( fixture_analysis() );
	$analysis_without_highlights = $client->analyze( 'Balance and analysis continue to work without highlight rendering.' );
	expect_true( '4' === $analysis_without_highlights['risk'], 'risk analysis has no dependency on ReportHighlightParser or ext-dom' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '{"balance":"7.00"}' );
	expect_true( '7.00' === $client->balance(), 'balance has no dependency on ReportHighlightParser or ext-dom' );

	// --- Shared text-payload contract for risk and highlights: count Unicode characters, never bytes. ---
	// Plain text with no HTML markup passes through report_markup() untouched (html_entity_decode only).
	$highlight_markup = static fn( string $text ): string => '<textarea id="textfield">' . $text . '</textarea>';
	$char_count        = static fn( string $text ): int => preg_match_all( '/./us', $text );

	foreach (
		array(
			'ASCII'    => 'a',
			'Cyrillic' => 'б',
			'emoji'    => '😀',
		) as $label => $char
	) {
		$at_limit   = str_repeat( $char, ApiClient::MAX_TEXT_LENGTH );
		$over_limit = str_repeat( $char, ApiClient::MAX_TEXT_LENGTH + 1 );
		expect_true( ApiClient::MAX_TEXT_LENGTH === $char_count( $at_limit ), "test fixture: $label at-limit string is exactly MAX_TEXT_LENGTH characters" );

		// risk: exactly MAX_TEXT_LENGTH characters is accepted and reaches the provider.
		respond( fixture_analysis() );
		$client->analyze( $at_limit );
		expect_true( ApiClient::MAX_TEXT_LENGTH === $char_count( $GLOBALS['turgenev_last_request']['args']['body']['text'] ), "risk: $label payload at the character limit is accepted and sent unmodified" );

		// risk: one character over the limit is rejected before any outbound request.
		$GLOBALS['turgenev_remote_post_calls'] = 0;
		expect_exception( static fn() => $client->analyze( $over_limit ), 'up to' );
		expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], "risk: an oversized $label payload never calls wp_remote_post" );

		// highlights: exactly MAX_TEXT_LENGTH characters is accepted and reaches the provider.
		$GLOBALS['turgenev_http_handler'] = static fn() => array(
			'response' => array( 'code' => 200 ),
			'body'     => $highlight_markup( $at_limit ),
		);
		$highlighted = $client->reportHighlights( 'abc12345', $at_limit );
		expect_true( $at_limit === $highlighted['text'], "highlights: $label payload at the character limit is accepted" );

		// highlights: one character over the limit is rejected before any outbound request
		// (the bug this replaces used strlen() > MAX_TEXT_LENGTH * 4, a byte budget that let
		// narrow characters like ASCII through at up to 4x the intended character limit).
		$GLOBALS['turgenev_remote_post_calls'] = 0;
		expect_exception( static fn() => $client->reportHighlights( 'abc12345', $over_limit ), 'up to' );
		expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], "highlights: an oversized $label payload never calls wp_remote_post" );
	}

	// The concrete old bug: 80,000 ASCII bytes/characters (4x MAX_TEXT_LENGTH) must never reach
	// the provider, even though the old `strlen() > MAX_TEXT_LENGTH * 4` check let it through.
	$ascii_80k = str_repeat( 'a', ApiClient::MAX_TEXT_LENGTH * 4 );
	expect_true( strlen( $ascii_80k ) === ApiClient::MAX_TEXT_LENGTH * 4, 'test fixture: 80,000 ASCII bytes is also 80,000 characters' );
	$GLOBALS['turgenev_remote_post_calls'] = 0;
	expect_exception( static fn() => $client->reportHighlights( 'abc12345', $ascii_80k ), 'up to' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], '80,000-character ASCII highlight source is rejected, not just truncated at the byte budget' );

	// invalid UTF-8 and embedded NUL are rejected for both operations, before any outbound request.
	foreach ( array( "a\0b", "\xFF" ) as $bad_text ) {
		$GLOBALS['turgenev_remote_post_calls'] = 0;
		expect_exception( static fn() => $client->analyze( $bad_text ), 'encoding' );
		expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'risk: malformed text never calls wp_remote_post' );

		$GLOBALS['turgenev_remote_post_calls'] = 0;
		expect_exception( static fn() => $client->reportHighlights( 'abc12345', $bad_text ), 'encoding' );
		expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'highlights: malformed text never calls wp_remote_post' );
	}

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
	// Defense in depth: even if a response slips past the HTTP layer's own size limit, the
	// raw body is rejected before JSON/markup parsing, not just capped by limit_response_size.
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => str_repeat( 'a', ApiClient::MAX_REPORT_LENGTH + 1 ) );
	expect_exception( static fn() => $client->balance(), 'oversized' );
	$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => str_repeat( 'a', ApiClient::MAX_REPORT_LENGTH + 1 ) );
	expect_exception( static fn() => $client->reportHighlights( 'abc12345', 'Text with style here.' ), 'unavailable' );
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

	$controller = new Al5dy\Turgenev\Ajax\ApiController( $client, new Al5dy\Turgenev\Support\RateLimiter() );
	$cases = array(
		array( array(), array(), 403, null ),
		// A generic edit_posts capability must never authorize document operations without a real target post.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text' ), array(), 400, null ),
		// (a) valid nonce + risk + text + NO post_id + edit_posts -> rejected.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text' ), array( 'edit_posts' ), 400, null ),
		// (e) highlights without post_id -> rejected, even holding manage_options.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'highlights', 'text' => 'Text' ), array( 'edit_posts', 'manage_options' ), 400, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '0' ), array( 'edit_posts' ), 400, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '-42' ), array(), 400, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '999' ), array( array( 'edit_post', 999 ) ), 400, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => array( 'risk' ) ), array(), 400, null ),
		// (b) valid nonce + risk + post_id=42 + edit_posts only -> rejected.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' ), array( 'edit_posts' ), 403, null ),
		// edit_post granted for a DIFFERENT post ID must never authorize post 42.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' ), array( array( 'edit_post', 999 ) ), 403, null ),
		// (c) valid nonce + risk + post_id=42 + edit_post(42) -> accepted.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => 'Text', 'post_id' => '42' ), array( array( 'edit_post', 42 ) ), 200, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'risk', 'text' => array( 'Text' ), 'post_id' => '42' ), array( array( 'edit_post', 42 ) ), 502, null ),
		// balance: editor screen with a post ID needs edit_post on it, never the generic edit_posts.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance' ), array(), 403, null ),
		// (g) balance без post_id + edit_posts -> rejected.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance' ), array( 'edit_posts' ), 403, null ),
		// (f) balance без post_id + manage_options -> accepted.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance' ), array( 'manage_options' ), 200, array( 'balance' => '10.50' ) ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance', 'post_id' => '42' ), array( 'edit_posts' ), 403, null ),
		// edit_post granted for a DIFFERENT post ID must never authorize balance on post 42 either.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance', 'post_id' => '42' ), array( array( 'edit_post', 999 ) ), 403, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance', 'post_id' => '42' ), array( array( 'edit_post', 42 ) ), 200, array( 'balance' => '10.50' ) ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance', 'post_id' => '999' ), array( array( 'edit_post', 999 ) ), 403, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'balance', 'post_id' => '999' ), array( 'manage_options' ), 200, array( 'balance' => '10.50' ) ),
	);
	foreach ( $cases as $case_index => [ $post, $caps, $status, $fixture ] ) {
		$_POST = $post; $GLOBALS['test_caps'] = $caps; $GLOBALS['turgenev_last_request'] = null; $GLOBALS['turgenev_remote_post_calls'] = 0; $GLOBALS['turgenev_cap_calls'] = array(); $GLOBALS['turgenev_test_transients'] = array();
		respond( $fixture ?? fixture_analysis() );
		try { $controller->handle(); throw new RuntimeException( 'Controller did not return JSON.' ); }
		catch ( JsonExit $response ) {
			expect_true( $response->status === $status, "AJAX case $case_index validates nonce, capability, object ID and scalar inputs" );
			if ( 200 === $status && isset( $fixture['balance'] ) ) { expect_true( $fixture['balance'] === $response->data['balance'], 'AJAX returns the validated balance to the editor' ); }
			if ( 200 === $status && 'risk' === ( $post['operation'] ?? '' ) ) { expect_true( 'Нет' === $response->data['result']['details'][0]['params'][0]['value'], 'AJAX returns validated textual measurements to the editor' ); }
			if ( in_array( $status, array( 400, 403 ), true ) ) {
				expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], "rejected AJAX case $case_index never calls wp_remote_post" );
			} elseif ( 200 === $status ) {
				expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], "authorized AJAX case $case_index reaches the provider transport exactly once" );
			}
		}
	}

	// --- Server-side rate limiting: JS busy state is not a security control. ---
	// A deterministic limit via the `turgenev_rate_limit` filter, independent of the
	// class's own defaults, so this test does not have to track them.
	$GLOBALS['turgenev_test_filters'] = array();
	add_filter(
		'turgenev_rate_limit',
		static function ( array $limits, string $operation ): array {
			return match ( $operation ) {
				'risk' => array(
					'limit'  => 3,
					'window' => 60,
				),
				'highlights' => array(
					'limit'  => 2,
					'window' => 60,
				),
				default => $limits,
			};
		},
		10,
		2
	);

	$GLOBALS['test_posts']              = array( 42, 43, 44 );
	$GLOBALS['test_user_id']            = 7;
	$GLOBALS['test_caps']               = array( array( 'edit_post', 42 ), array( 'edit_post', 43 ), array( 'edit_post', 44 ) );
	$GLOBALS['turgenev_test_transients'] = array();

	$call = static function ( string $operation, int $post_id ) use ( $controller ): int {
		$_POST = array(
			'nonce'        => 'valid-nonce',
			'operation'    => $operation,
			'text'         => 'Text',
			'post_id'      => (string) $post_id,
			'report_token' => 'risk12345',
		);
		$GLOBALS['turgenev_remote_post_calls'] = 0;
		try {
			$controller->handle();
			throw new RuntimeException( 'Controller did not return JSON.' );
		} catch ( JsonExit $response ) {
			return $response->status;
		}
	};

	respond( fixture_analysis() );
	for ( $i = 1; $i <= 3; $i++ ) {
		expect_true( 200 === $call( 'risk', 42 ), "risk request $i of 3 is allowed within the filtered limit" );
		expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], "risk request $i of 3 reaches the provider" );
	}
	// A normal manual pace never hits this; only a fourth request in the same window does.
	expect_true( 429 === $call( 'risk', 42 ), 'a fourth risk request in the same window is rejected with 429' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited risk request never calls wp_remote_post' );

	// A different target post for the same user is a distinct bucket (not blocked by post 42's exhausted limit).
	expect_true( 200 === $call( 'risk', 43 ), 'risk on a different post is unaffected by another post\'s exhausted limit' );

	// A different user for the same post is also a distinct bucket.
	$GLOBALS['test_user_id'] = 8;
	expect_true( 200 === $call( 'risk', 42 ), 'risk from a different user is unaffected by another user\'s exhausted limit' );
	$GLOBALS['test_user_id'] = 7;

	// highlights has its own counter, independent of risk, even though both target post 42.
	respond_html( '<textarea id="textfield"><p>Text</p></textarea>' );
	expect_true( 200 === $call( 'highlights', 42 ), 'highlights request 1 of 2 is allowed after risk is already exhausted for the same post' );
	expect_true( 200 === $call( 'highlights', 42 ), 'highlights request 2 of 2 is allowed within the filtered limit' );
	expect_true( 429 === $call( 'highlights', 42 ), 'a third highlights request in the same window is rejected with 429' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited highlights request never calls wp_remote_post' );

	// A window that has already elapsed resets the counter, even if it was previously exhausted.
	$expired_key = 'turgenev_rl_' . md5( 'risk|7|44' );
	$GLOBALS['turgenev_test_transients'][ $expired_key ] = array(
		'count' => 99,
		'reset' => time() - 5,
	);
	respond( fixture_analysis() );
	expect_true( 200 === $call( 'risk', 44 ), 'a request after the window has elapsed is allowed again' );

	$GLOBALS['turgenev_test_filters'] = array();

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
