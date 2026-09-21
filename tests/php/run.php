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

/**
 * `add_option()`'s only load-bearing property for RateLimiter's fallback mutex is that it
 * fails when the row already exists, matching the real function's unique-index behavior.
 */
function add_option( string $name, $value = '', string $deprecated = '', $autoload = 'yes' ): bool {
	if ( array_key_exists( $name, $GLOBALS['turgenev_test_options'] ) ) {
		return false;
	}
	$GLOBALS['turgenev_test_options'][ $name ] = $value;
	return true;
}
function delete_option( string $name ): bool { unset( $GLOBALS['turgenev_test_options'][ $name ] ); return true; }

$GLOBALS['turgenev_test_use_object_cache'] = false;
$GLOBALS['turgenev_test_cache']            = array();
function wp_using_ext_object_cache(): bool { return $GLOBALS['turgenev_test_use_object_cache']; }
function wp_cache_add( string $key, $value, string $group = '', int $expire = 0 ): bool {
	$cache_key = $group . ':' . $key;
	if ( array_key_exists( $cache_key, $GLOBALS['turgenev_test_cache'] ) ) {
		return false;
	}
	$GLOBALS['turgenev_test_cache'][ $cache_key ] = $value;
	return true;
}
function wp_cache_incr( string $key, int $offset = 1, string $group = '' ) {
	$cache_key = $group . ':' . $key;
	if ( ! array_key_exists( $cache_key, $GLOBALS['turgenev_test_cache'] ) ) {
		return false;
	}
	$GLOBALS['turgenev_test_cache'][ $cache_key ] += $offset;
	return $GLOBALS['turgenev_test_cache'][ $cache_key ];
}
function add_filter( string $tag, callable $callback, int $priority = 10, int $accepted_args = 1 ): void { $GLOBALS['turgenev_test_filters'][ $tag ][] = $callback; }
/**
 * Clears only the two rate-limit filters between scenarios, never the whole filter
 * registry: an unconditional reset would also drop the top-of-file `turgenev_has_dom`
 * override used by TURGENEV_FORCE_NO_DOM, silently reverting later assertions back to
 * whatever ext-dom actually is on the machine running the suite.
 */
function reset_rate_limit_filters(): void {
	unset( $GLOBALS['turgenev_test_filters']['turgenev_rate_limit'], $GLOBALS['turgenev_test_filters']['turgenev_rate_limit_global'] );
}
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
require_once dirname( __DIR__, 2 ) . '/src/Api/ReportSectionParser.php';
require_once dirname( __DIR__, 2 ) . '/src/Api/ApiClient.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/SettingsPage.php';
require_once dirname( __DIR__, 2 ) . '/src/Admin/EditorIntegration.php';
require_once dirname( __DIR__, 2 ) . '/src/Ajax/ApiController.php';

// Explicit no-DOM scenario, independent of whether this machine actually has ext-dom:
// `php -d ...` cannot uninstall an extension, but the runtime's own capability filter can
// be forced off the same way EditorIntegration's constructor override does, so CI can run
// this suite once "as-is" and once forced into the DOM-absent branch on the same host.
if ( getenv( 'TURGENEV_FORCE_NO_DOM' ) ) {
	add_filter( 'turgenev_has_dom', static fn(): bool => false );
}

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

	// Token/payload validation happens before any DOM parsing, so it is exercised
	// unconditionally regardless of whether this host actually has ext-dom.
	expect_exception( static fn() => $client->reportHighlights( 'invalid report URL', 'Text with style here.' ), 'reference is invalid' );

	// --- Capability-disabled scenario: highlight rendering degrades without ext-dom. ---
	// Forced false/true never depends on whether ext-dom is actually installed: false never
	// touches DOMDocument at all, so it is safe to run on every host.
	$no_dom_parser = new Al5dy\Turgenev\Api\ReportHighlightParser( false );
	expect_exception( static fn() => $no_dom_parser->parse( $report_markup, 'Text with style here.' ), 'unavailable' );

	if ( Al5dy\Turgenev\Support\Requirements::hasDom() ) {
		// --- DOM-present: full highlight parsing. ---
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
		$highlights = $client->reportHighlights( 'abc12345', 'Text with style here.' );
		expect_true( 'Text with style here.' === $highlights['text'], 'report highlight text matches the analyzed block' );
		expect_true( 1 === count( $highlights['marks'] ), 'highlighted report span becomes one safe mark' );
		expect_true( 5 === $highlights['marks'][0]['start'] && 15 === $highlights['marks'][0]['end'], 'highlight offsets use browser-compatible UTF-16 positions' );
		expect_true( 'style' === $highlights['marks'][0]['category'] && 2 === $highlights['marks'][0]['level'], 'highlight category and level are extracted from classes' );
		expect_true( 'slop' === $highlights['marks'][0]['type'], 'highlight type preserves the exact class prefix ("slop"), not just the broader category ("style")' );

		// "bb" and "doubles" both resolve to real categories too ("style" and "frequency"
		// respectively), but with a different `type`, proving CATEGORIES is consulted per
		// prefix rather than a single hardcoded one.
		$GLOBALS['turgenev_http_handler'] = static fn() => array(
			'response' => array( 'code' => 200 ),
			'body'     => '<html><body><textarea id="textfield"><p>One <span class="xhl bb3">two</span> and <span class="xhl doubles5">three</span> words.</p></textarea></body></html>',
		);
		$multi_type = $client->reportHighlights( 'abc12345', 'One two and three words.' );
		expect_true( 2 === count( $multi_type['marks'] ), 'two distinct highlight prefixes in one report become two marks' );
		expect_true( 'style' === $multi_type['marks'][0]['category'] && 'bb' === $multi_type['marks'][0]['type'] && 3 === $multi_type['marks'][0]['level'], '"bb3" is parsed as category=style, type=bb, level=3, uncapped' );
		expect_true( 'frequency' === $multi_type['marks'][1]['category'] && 'doubles' === $multi_type['marks'][1]['type'] && 5 === $multi_type['marks'][1]['level'], '"doubles5" is parsed as category=frequency, type=doubles, level=5 — never capped to 3 like the old generic severity scale' );

		// An unrecognized xhl class (e.g. a spelling/misprint span) is silently dropped, not
		// mapped to a made-up category/type.
		$GLOBALS['turgenev_http_handler'] = static fn() => array(
			'response' => array( 'code' => 200 ),
			'body'     => '<html><body><textarea id="textfield"><p>One <span class="xhl misprints1">two</span> words.</p></textarea></body></html>',
		);
		$unrecognized = $client->reportHighlights( 'abc12345', 'One two words.' );
		expect_true( array() === $unrecognized['marks'], 'an unrecognized xhl class (e.g. "misprints1") produces no mark' );
		expect_true( 'https://turgenev.ashmanov.com/' === $GLOBALS['turgenev_last_request']['url'], 'report is requested from the fixed provider endpoint' );
		expect_true( 'abc12345' === $GLOBALS['turgenev_last_request']['args']['body']['t'], 'report reference is sent using the provider POST form' );
		expect_true( false === isset( $GLOBALS['turgenev_last_request']['args']['body']['key'] ), 'report retrieval never sends the API key' );
		expect_true( 'Turgenev-WordPress/' . TURGENEV_VERSION === $GLOBALS['turgenev_last_request']['args']['headers']['User-Agent'], 'report retrieval User-Agent never includes the site URL or any other site-identifying data' );
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
		expect_exception( static fn() => $client->reportHighlights( 'abc12345', 'Different text.' ), 'does not match' );

		// Forcing has_dom=true still parses normally: the override is not one-directional.
		// This only runs on a host that genuinely has ext-dom, since it exercises real DOMDocument.
		$forced_dom_parser = new Al5dy\Turgenev\Api\ReportHighlightParser( true );
		$still_parses      = $forced_dom_parser->parse( $report_markup, 'Text with style here.' );
		expect_true( 'Text with style here.' === $still_parses['text'], 'forcing has_dom=true still parses normally (the override is not one-directional)' );
	} else {
		// --- DOM-absent: the real (not forced) environment gracefully rejects highlight parsing. ---
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $report_markup );
		expect_exception( static fn() => $client->reportHighlights( 'abc12345', 'Text with style here.' ), 'unavailable' );
	}

	// The browser must be told, so it can hide the Highlight action instead of offering one
	// that is guaranteed to fail.
	$integration = new Al5dy\Turgenev\Admin\EditorIntegration( new OptionStore() );
	$integration->enqueueBlockEditorAssets();
	expect_true( Al5dy\Turgenev\Support\Requirements::hasDom() === $GLOBALS['test_localized']['turgenev-client']['highlightsAvailable'], 'browser config reports the real (unforced) highlight capability by default' );

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

	// --- reportSectionDetails(): the accordion's per-section fetch shares reportHighlights' transport. ---
	expect_exception( static fn() => $client->reportSectionDetails( 'abc12345', 'not-a-real-section' ), 'Unsupported' );
	expect_exception( static fn() => $client->reportSectionDetails( 'bad token', 'overall' ), 'reference is invalid' );

	$section_markup = static fn( string $extra = '' ): string => '<html><body><div id="infoblock"><table class="xprops">'
		. '<tr><td class="xphintblock"><span class="xpname">Metric</span></td><td><span class="mark">2</span></td><td align="right"><span class="value">0.42</span></td></tr>'
		. "<tr class='low tghidden'><td class='xphintblock'><span class='xpname'>Secondary</span></td><td></td><td align='right'><span class='value'>Нет</span></td></tr>"
		. '</table>' . $extra . '</div></body></html>';

	if ( Al5dy\Turgenev\Support\Requirements::hasDom() ) {
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $section_markup() );
		$style = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( 'Metric' === $style['params'][0]['name'] && '0.42' === $style['params'][0]['value'] && '2' === $style['params'][0]['score'] && false === $style['params'][0]['low'], 'section params expose name/value/score and a secondary flag' );
		expect_true( 'Secondary' === $style['params'][1]['name'] && true === $style['params'][1]['low'], 'a "low"/"tghidden" characteristic row is flagged secondary' );
		expect_true( array() === $style['legend'], 'style legend is empty when the report has no #legend block' );
		expect_true( 'slop_words' === $GLOBALS['turgenev_last_request']['args']['body']['coverdict'], 'the style section requests the provider\'s slop_words report tab' );
		expect_true( 'abc12345' === $GLOBALS['turgenev_last_request']['args']['body']['t'], 'section details reuse the overall report token, not a separate per-block one' );
		expect_true( false === isset( $GLOBALS['turgenev_last_request']['args']['body']['key'] ), 'section detail retrieval never sends the API key' );
		expect_true( ! array_key_exists( 'hint', $style['params'][0] ) && ! array_key_exists( 'hintUrl', $style['params'][0] ), 'a characteristic row with no xphint div exposes no hint/hintUrl at all' );
		expect_true( ! array_key_exists( 'wordCount', $style ), 'a report with no #words_count span exposes no wordCount at all' );

		// The provider's own hover-tooltip content (a "div.xphint" inside the xphintblock
		// cell, confirmed live on an anonymous fetch, for every section, not only overall):
		// an explanatory sentence, sometimes trailing document-specific detail after a <br>,
		// then a "Подробнее" link and an (always empty) "cloud" span this plugin discards.
		$hint_markup = '<html><body><div id="infoblock"><table class="xprops">'
			. "<tr><td class='xphintblock'><span class='xpname'>«Академическая тошнота»</span>"
			. "<div class='xphint'>Параметр, оценивающий количество повторов слов в тексте.<br>"
			. "<a href='/?h=vkladki#academ' target='bbhelp' onclick=\"return windowOpen(this)\">Подробнее</a>"
			. "<span class='cloud'></span></div></td><td><span class='mark'>5</span></td><td align='right'><span class='value'>27.27</span></td></tr>"
			. "<tr><td class='xphintblock'><span class='xpname'>Сверхчастые слова</span>"
			. "<div class='xphint'>Количество слов, которые встречаются в тексте существенно чаще:<br><i>слово</i><br>"
			. "<a href='/?h=vkladki#superfreq' target='bbhelp' onclick=\"return windowOpen(this)\">Подробнее</a>"
			. "<span class='cloud'></span></div></td><td><span class='mark'>1</span></td><td align='right'><span class='value'>1</span></td></tr>"
			. "<tr><td class='xphintblock'><span class='xpname'>No hint here</span></td><td></td><td align='right'><span class='value'>0</span></td></tr>"
			. "<tr><td class='xphintblock'><span class='xpname'>Untrusted href</span>"
			. "<div class='xphint'>Should be skipped.<br><a href='https://evil.example/'>Подробнее</a><span class='cloud'></span></div></td><td></td><td align='right'><span class='value'>0</span></td></tr>"
			. '</table></div></body></html>';
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $hint_markup );
		$overall_with_hints               = $client->reportSectionDetails( 'abc12345', 'overall' );
		expect_true(
			'Параметр, оценивающий количество повторов слов в тексте. Подробнее' !== $overall_with_hints['params'][0]['hint']
			&& 'Параметр, оценивающий количество повторов слов в тексте.' === $overall_with_hints['params'][0]['hint'],
			'the hint text excludes the trailing "Подробнее" link and cloud span'
		);
		expect_true( 'https://turgenev.ashmanov.com/?h=vkladki#academ' === $overall_with_hints['params'][0]['hintUrl'], 'the relative help-wiki href resolves against the provider\'s own endpoint' );
		expect_true(
			'Количество слов, которые встречаются в тексте существенно чаще: слово' === $overall_with_hints['params'][1]['hint'],
			'a <br> before trailing document-specific detail (e.g. the flagged word) becomes a space, not a run-together word'
		);
		expect_true( ! array_key_exists( 'hint', $overall_with_hints['params'][2] ) && ! array_key_exists( 'hintUrl', $overall_with_hints['params'][2] ), 'a characteristic with no div.xphint at all exposes no hint fields' );
		expect_true( ! array_key_exists( 'hint', $overall_with_hints['params'][3] ) && ! array_key_exists( 'hintUrl', $overall_with_hints['params'][3] ), 'an href that is not the expected help-wiki anchor shape is never trusted, even with real hint text alongside it' );

		// The analyzed document's word count (a plain `<span id='words_count'>`, confirmed
		// live on every report tab, not only overall).
		$word_count_markup = static fn( string $words_count ): string => '<html><body><div id="infoblock"><table class="xprops">'
			. '<tr><td class="xphintblock"><span class="xpname">Metric</span></td><td></td><td align="right"><span class="value">0</span></td></tr>'
			. '</table></div>' . $words_count . '</body></html>';
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $word_count_markup( "<span id='words_count'>42</span>" ) );
		$with_word_count                  = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( 42 === $with_word_count['wordCount'], 'wordCount is parsed as an integer from the report\'s own span' );

		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $word_count_markup( "<span id='words_count'></span>" ) );
		$with_blank_word_count            = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( ! array_key_exists( 'wordCount', $with_blank_word_count ), 'a blank #words_count span never becomes wordCount: 0' );

		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $word_count_markup( "<span id='words_count'>not a number</span>" ) );
		$with_invalid_word_count          = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( ! array_key_exists( 'wordCount', $with_invalid_word_count ), 'non-numeric #words_count content is never trusted' );

		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $section_markup() );
		$overall = $client->reportSectionDetails( 'abc12345', 'overall' );
		expect_true( 'bb-mix' === $GLOBALS['turgenev_last_request']['args']['body']['coverdict'], 'the overall section requests the provider\'s bb-mix report tab' );
		expect_true( ! array_key_exists( 'words', $overall ) && ! array_key_exists( 'breakdown', $overall ), 'the overall section never exposes the frequency/keywords-only fields' );
		expect_true( array() === $overall['legend'], 'overall legend is empty when the report has no #legend block' );
		expect_true( array() === $overall['sentenceProblems'], 'overall sentenceProblems is empty when the report has no XHints script' );

		// The "Overall risk" report's own legend (confirmed live on an anonymous fetch to
		// carry no legend-active/legend-inactive rows, unlike this dev-only exclusion test's
		// fixture above) and its per-sentence XHints breakdown.
		$xhints_markup = $section_markup(
			"<div id='legend'><table><tr><td><em class='xhl bb1'>&nbsp;</em></td><td>Some problems.</td></tr></table></div>"
			. '<script>var XHints = {"107-33":[{"c":"<a href=\'#doubles\' onclick=\'tabAClick(this); return false;\'>Word repetition</a>,<br><a href=\'#slop_words\' onclick=\'tabAClick(this); return false;\'>Style errors</a>","t":""}],"not-a-real-id-shape":[{"c":"ignored","t":""}]};</script>'
		);
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $xhints_markup );
		$overall_with_xhints = $client->reportSectionDetails( 'abc12345', 'overall' );
		expect_true( 1 === count( $overall_with_xhints['legend'] ) && 'bb' === $overall_with_xhints['legend'][0]['type'] && 'Some problems.' === $overall_with_xhints['legend'][0]['label'], 'the overall section now exposes its own color legend, previously skipped entirely' );
		expect_true( 1 === count( $overall_with_xhints['sentenceProblems'] ), 'a malformed sentence id ("not-a-real-id-shape") is dropped, a well-formed one kept' );
		expect_true(
			array( 'Word repetition', 'Style errors' ) === $overall_with_xhints['sentenceProblems']['107-33'],
			'sentenceProblems strips the <a href=...> markup down to plain category labels, in document order'
		);

		$style_never_gets_sentence_problems = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( ! array_key_exists( 'sentenceProblems', $style_never_gets_sentence_problems ), 'only the overall section parses sentenceProblems' );

		$legend_markup = $section_markup( "<div id='legend'><table><tr><td><em class='xhl slop1'>&nbsp;</em></td><td>Potential issue.</td></tr><tr class='legend-active'><td><em class='xhl bb3'>&nbsp;</em></td><td>Never surfaces as a category legend row.</td></tr></table></div>" );
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $legend_markup );
		$style_with_legend = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( 1 === count( $style_with_legend['legend'] ) && 1 === $style_with_legend['legend'][0]['level'] && 'Potential issue.' === $style_with_legend['legend'][0]['label'], 'legend rows expose severity level and label, excluding overall-risk verdict rows' );
		expect_true( 'slop' === $style_with_legend['legend'][0]['type'], 'legend rows expose the exact class prefix ("slop"), not just a generic severity number, so the browser can match the provider\'s own swatch color' );

		// A legend row whose <em> carries no recognized xhl class still surfaces (never
		// dropped), with type='' and level=0 as the "unknown" fallback.
		$unmatched_legend_markup = $section_markup( "<div id='legend'><table><tr><td><em class='xhl'>&nbsp;</em></td><td>No recognized class.</td></tr></table></div>" );
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $unmatched_legend_markup );
		$unmatched_legend = $client->reportSectionDetails( 'abc12345', 'style' );
		expect_true( '' === $unmatched_legend['legend'][0]['type'] && 0 === $unmatched_legend['legend'][0]['level'], 'a legend row with no recognized xhl class falls back to type="", level=0 instead of being dropped' );

		$keywords_markup = '<html><body><div id="infoblock"><table class="xprops">'
			. '<tr><td class="xphintblock"><span class="xpname">Coverage</span></td><td><span class="mark">4</span></td><td align="right"><span class="value">0.5</span></td></tr>'
			. "<tr><td><span class='xpname'>&bull;&nbsp;query coverage</span></td><td></td><td align='right'><span class='value'>0.2</span></td></tr>"
			. '</table></div></body></html>';
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $keywords_markup );
		$keywords = $client->reportSectionDetails( 'abc12345', 'keywords' );
		expect_true( 1 === count( $keywords['params'] ), 'the keywords coverage bullet is excluded from the main characteristic list' );
		expect_true( 1 === count( $keywords['breakdown'] ) && 'query coverage' === $keywords['breakdown'][0]['label'] && '0.2' === $keywords['breakdown'][0]['value'], 'the keywords breakdown strips the provider\'s bullet glyph' );

		$words_markup = '<html><body><div id="infoblock"><table class="xprops"></table>'
			. "<div id='words_frq_stat'><table class='wstat'>"
			. "<tr class='stop'><td>and</td><td>&nbsp;</td><td>&nbsp;<span class='value'>3</span></td><td align=right>&nbsp;<span class='value'>10.0%</span></td></tr>"
			. "<tr class='xhl doubles4 stmhl-btn stm-6-190E7'><td>house</td><td>&nbsp;</td><td>&nbsp;<span class='value'>5</span></td><td align=right>&nbsp;<span class='value'>3.3%</span></td></tr>"
			. '</table></div>'
			. "<div id='bgrms_frq_stat'><table class='wstat'><tr><td>fast car</td><td><span class='value'>2</span></td></tr></table></div>"
			. '</div></body></html>';
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $words_markup );
		$frequency = $client->reportSectionDetails( 'abc12345', 'frequency' );
		expect_true( 2 === count( $frequency['words'] ) && 'and' === $frequency['words'][0]['text'] && 3 === $frequency['words'][0]['count'] && '10.0%' === $frequency['words'][0]['percent'] && true === $frequency['words'][0]['stopword'], 'word repetition rows expose text, count, percentage and the stop-word flag' );
		expect_true( ! array_key_exists( 'type', $frequency['words'][0] ), 'a plain stop-word row (no xhl class) carries no type/level' );
		expect_true( 'doubles' === $frequency['words'][1]['type'] && 4 === $frequency['words'][1]['level'] && false === $frequency['words'][1]['stopword'], 'a repeated word row ("xhl doubles4") exposes the same type/level its in-text highlight uses, so the table can be colored to match' );
		expect_true( 1 === count( $frequency['phrases'] ) && 'fast car' === $frequency['phrases'][0]['text'] && 2 === $frequency['phrases'][0]['count'], 'phrase repetition rows expose text and count, with no percentage' );

		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => '<html><body>No report panel here.</body></html>' );
		expect_exception( static fn() => $client->reportSectionDetails( 'abc12345', 'overall' ), 'did not contain section details' );

		$no_dom_section_parser = new Al5dy\Turgenev\Api\ReportSectionParser( false );
		expect_exception( static fn() => $no_dom_section_parser->parse( $section_markup(), 'style' ), 'unavailable' );
	} else {
		$GLOBALS['turgenev_http_handler'] = static fn() => array( 'response' => array( 'code' => 200 ), 'body' => $section_markup() );
		expect_exception( static fn() => $client->reportSectionDetails( 'abc12345', 'style' ), 'unavailable' );
	}

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
		// (Parsing the response itself needs ext-dom; the length/encoding contract validated
		// here runs before that and is exercised on every host either way.)
		$GLOBALS['turgenev_http_handler'] = static fn() => array(
			'response' => array( 'code' => 200 ),
			'body'     => $highlight_markup( $at_limit ),
		);
		if ( Al5dy\Turgenev\Support\Requirements::hasDom() ) {
			$highlighted = $client->reportHighlights( 'abc12345', $at_limit );
			expect_true( $at_limit === $highlighted['text'], "highlights: $label payload at the character limit is accepted" );
		} else {
			expect_exception( static fn() => $client->reportHighlights( 'abc12345', $at_limit ), 'unavailable' );
		}

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
		// details: a document operation, so it follows risk/highlights' auth path exactly.
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'details', 'report_token' => 'abc12345', 'section' => 'style' ), array( 'edit_posts', 'manage_options' ), 400, null ),
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'details', 'report_token' => 'abc12345', 'section' => 'style', 'post_id' => '42' ), array( 'edit_posts' ), 403, null ),
		// A JSON body is not a valid report page, so an authorized request still fails safely (never a fatal).
		array( array( 'nonce' => 'valid-nonce', 'operation' => 'details', 'report_token' => 'abc12345', 'section' => 'style', 'post_id' => '42' ), array( array( 'edit_post', 42 ) ), 502, null ),
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
	// Deterministic limits via the `turgenev_rate_limit` (per-post burst) and
	// `turgenev_rate_limit_global` (per-user, all posts combined) filters, independent of
	// the class's own defaults, so this test does not have to track them.
	reset_rate_limit_filters();
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
				'details' => array(
					'limit'  => 2,
					'window' => 60,
				),
				default => $limits,
			};
		},
		10,
		2
	);
	add_filter(
		'turgenev_rate_limit_global',
		static function ( array $limits, string $operation ): array {
			return match ( $operation ) {
				// 5 lets exactly one post-42 burst (3) plus one more post (post 43) through,
				// so the very next distinct post proves rotation cannot outrun the global cap.
				'risk' => array(
					'limit'  => 5,
					'window' => 60,
				),
				'highlights' => array(
					'limit'  => 3,
					'window' => 60,
				),
				'details' => array(
					'limit'  => 3,
					'window' => 60,
				),
				default => $limits,
			};
		},
		10,
		2
	);

	$GLOBALS['test_posts']              = array( 42, 43, 44, 45 );
	$GLOBALS['test_user_id']            = 7;
	$GLOBALS['test_caps']               = array( array( 'edit_post', 42 ), array( 'edit_post', 43 ), array( 'edit_post', 44 ), array( 'edit_post', 45 ) );
	$GLOBALS['turgenev_test_transients'] = array();

	$call = static function ( string $operation, int $post_id ) use ( $controller ): int {
		$_POST = array(
			'nonce'        => 'valid-nonce',
			'operation'    => $operation,
			'text'         => 'Text',
			'post_id'      => (string) $post_id,
			'report_token' => 'risk12345',
			'section'      => 'style',
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
		expect_true( 200 === $call( 'risk', 42 ), "risk request $i of 3 is allowed within the filtered per-post limit" );
		expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], "risk request $i of 3 reaches the provider" );
	}
	// A normal manual pace never hits this; only a fourth request in the same window does.
	expect_true( 429 === $call( 'risk', 42 ), 'a fourth risk request on the same post in the same window is rejected with 429 (post-level burst limit)' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited risk request never calls wp_remote_post' );

	// A different target post for the same user is a distinct per-post bucket (not blocked
	// by post 42's exhausted limit) and still within the global budget (4th global request).
	expect_true( 200 === $call( 'risk', 43 ), 'risk on a different post is unaffected by another post\'s exhausted per-post limit' );

	// --- Post rotation cannot bypass the global per-user limit. ---
	// Post 45 has never been touched before (a fresh per-post bucket), yet this is the 6th
	// risk request for user 7 overall (3 on post 42 + 1 rejected on post 42 + 1 on post 43 =
	// 5 counted global attempts already), so the global cap (5) is what rejects it, not the
	// per-post one. Rotating to a brand-new post ID must not reset the effective budget.
	expect_true( 429 === $call( 'risk', 45 ), 'switching to a never-used post does not bypass the global per-user limit' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a globally rate-limited request on a fresh post never calls wp_remote_post' );

	// A different user for the same post is also a distinct bucket (separate post AND global budget).
	$GLOBALS['test_user_id'] = 8;
	expect_true( 200 === $call( 'risk', 42 ), 'risk from a different user is unaffected by another user\'s exhausted limit' );
	$GLOBALS['test_user_id'] = 7;

	// highlights has its own counter, independent of risk, even though both target post 42.
	// A rate limit allows the request through to the provider before parsing; whether the
	// *provider response* then parses into a 200 depends on ext-dom, which is orthogonal to
	// rate limiting, so only the "reached the provider" outcome is asserted when DOM is absent.
	respond_html( '<textarea id="textfield"><p>Text</p></textarea>' );
	$allowed_status = Al5dy\Turgenev\Support\Requirements::hasDom() ? 200 : 502;
	expect_true( $allowed_status === $call( 'highlights', 42 ), 'highlights request 1 of 2 is allowed through rate limiting after risk is already exhausted for the same post' );
	expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], 'highlights request 1 of 2 reaches the provider' );
	expect_true( $allowed_status === $call( 'highlights', 42 ), 'highlights request 2 of 2 is allowed through rate limiting within the filtered limit' );
	expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], 'highlights request 2 of 2 reaches the provider' );
	expect_true( 429 === $call( 'highlights', 42 ), 'a third highlights request in the same window is rejected with 429 regardless of ext-dom' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited highlights request never calls wp_remote_post' );

	// details has its own counter too, independent of both risk and highlights.
	respond_html( '<html><body><div id="infoblock"><table class="xprops"></table></div></body></html>' );
	$details_allowed_status = Al5dy\Turgenev\Support\Requirements::hasDom() ? 200 : 502;
	expect_true( $details_allowed_status === $call( 'details', 42 ), 'details request 1 of 2 is allowed through rate limiting after risk and highlights are already exhausted for the same post' );
	expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], 'details request 1 of 2 reaches the provider' );
	expect_true( $details_allowed_status === $call( 'details', 42 ), 'details request 2 of 2 is allowed through rate limiting within the filtered limit' );
	expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], 'details request 2 of 2 reaches the provider' );
	expect_true( 429 === $call( 'details', 42 ), 'a third details request in the same window is rejected with 429 regardless of ext-dom' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited details request never calls wp_remote_post' );

	reset_rate_limit_filters();

	// --- Window reset: a fixed-window bucket starts over once the window rolls forward. ---
	// A dedicated user/post/short window so this is independent of the buckets exhausted above.
	add_filter( 'turgenev_rate_limit', static fn( array $limits, string $operation ): array => 'risk' === $operation ? array( 'limit' => 1, 'window' => 1 ) : $limits, 10, 2 );
	add_filter( 'turgenev_rate_limit_global', static fn( array $limits, string $operation ): array => 'risk' === $operation ? array( 'limit' => 1, 'window' => 1 ) : $limits, 10, 2 );
	$GLOBALS['test_user_id'] = 9;
	$GLOBALS['test_posts'][] = 46;
	$GLOBALS['test_caps']    = array( array( 'edit_post', 46 ) );
	respond( fixture_analysis() );
	expect_true( 200 === $call( 'risk', 46 ), 'window reset: the first request in a fresh 1-second window is allowed' );
	expect_true( 429 === $call( 'risk', 46 ), 'window reset: an immediate second request in the same 1-second window is rejected' );
	usleep( 1_100_000 );
	expect_true( 200 === $call( 'risk', 46 ), 'window reset: a request after the window has elapsed is allowed again, even though the bucket was previously exhausted' );
	$GLOBALS['test_user_id'] = 7;
	reset_rate_limit_filters();

	// --- balance has its own small budget so an editor cannot hammer a "free" provider call. ---
	add_filter( 'turgenev_rate_limit', static fn( array $limits, string $operation ): array => 'balance' === $operation ? array( 'limit' => 2, 'window' => 60 ) : $limits, 10, 2 );
	add_filter( 'turgenev_rate_limit_global', static fn( array $limits, string $operation ): array => 'balance' === $operation ? array( 'limit' => 5, 'window' => 60 ) : $limits, 10, 2 );
	$GLOBALS['test_user_id'] = 30;
	$GLOBALS['test_caps']    = array( 'manage_options' );
	$balance_call            = static function () use ( $controller ): int {
		$_POST = array(
			'nonce'     => 'valid-nonce',
			'operation' => 'balance',
		);
		$GLOBALS['turgenev_remote_post_calls'] = 0;
		try {
			$controller->handle();
			throw new RuntimeException( 'Controller did not return JSON.' );
		} catch ( JsonExit $response ) {
			return $response->status;
		}
	};
	respond( array( 'balance' => '10.50' ) );
	expect_true( 200 === $balance_call(), 'balance request 1 of 2 is allowed within its own limit' );
	expect_true( 1 === $GLOBALS['turgenev_remote_post_calls'], 'balance request 1 of 2 reaches the provider' );
	expect_true( 200 === $balance_call(), 'balance request 2 of 2 is allowed' );
	expect_true( 429 === $balance_call(), 'a third balance request in the same window is rejected with 429' );
	expect_true( 0 === $GLOBALS['turgenev_remote_post_calls'], 'a rate-limited balance request never calls wp_remote_post' );
	reset_rate_limit_filters();

	// --- Lock/contention behavior of the no-object-cache fallback path. ---
	// White-box: mirrors RateLimiter's own key derivation to seed a lock directly.
	$rate_limiter_direct = new Al5dy\Turgenev\Support\RateLimiter();
	$bucket_id            = (int) floor( time() / 60 );
	$lock_for = static fn( int $user_id, int $post_id ): string =>
		'_turgenev_rl_lock_' . md5( 'turgenev_rl_p_' . md5( 'risk|' . $user_id . '|' . $post_id ) . '_' . $bucket_id );

	// A lock actively (freshly) held by "another process" is not stolen: the request fails
	// closed (treated as rate-limited) rather than silently skipping the counter.
	$contended_lock = $lock_for( 100, 200 );
	add_option( $contended_lock, time(), '', 'no' );
	expect_true( true === $rate_limiter_direct->tooManyRequests( 'risk', 100, 200 ), 'contention on a fresh, actively-held lock fails closed instead of silently skipping the counter' );
	delete_option( $contended_lock );

	// A lock left behind by a crashed request (older than the staleness threshold) is
	// reclaimed, and is not left behind afterward (no permanently growing option).
	$stale_lock = $lock_for( 101, 201 );
	add_option( $stale_lock, time() - 10, '', 'no' );
	expect_true( false === $rate_limiter_direct->tooManyRequests( 'risk', 101, 201 ), 'a stale lock left by a crashed request is reclaimed rather than wedging the bucket shut' );
	expect_true( ! array_key_exists( $stale_lock, $GLOBALS['turgenev_test_options'] ), 'the reclaimed lock option is deleted again after use, not left behind permanently' );

	// --- Atomic path via a persistent external object cache. ---
	$GLOBALS['turgenev_test_use_object_cache'] = true;
	$GLOBALS['turgenev_test_cache']            = array();
	$object_cache_limiter                      = new Al5dy\Turgenev\Support\RateLimiter();
	for ( $i = 1; $i <= 12; $i++ ) {
		expect_true( false === $object_cache_limiter->tooManyRequests( 'risk', 40, 90 ), "object-cache path: request $i of 12 within the default per-post limit is allowed" );
	}
	expect_true( true === $object_cache_limiter->tooManyRequests( 'risk', 40, 90 ), 'object-cache path: a 13th request in the same window exceeds the default per-post limit' );
	$GLOBALS['turgenev_test_use_object_cache'] = false;

	if ( Al5dy\Turgenev\Support\Requirements::hasDom() ) {
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
	} else {
		// DOM-absent: direct parser construction with no override still resolves the real
		// (false) capability and rejects gracefully, rather than fatally erroring on a
		// missing DOMDocument class.
		$parser = new Al5dy\Turgenev\Api\ReportHighlightParser();
		expect_exception(
			static fn() => $parser->parse( '<textarea id="textfield"><p>one</p></textarea>', 'one' ),
			'unavailable'
		);
	}

	echo 'PHP smoke tests passed: ' . $tests . PHP_EOL . ( Al5dy\Turgenev\Support\Requirements::hasDom() ? '(ext-dom present: full suite ran)' : '(ext-dom absent: DOM-dependent parser assertions were skipped by design)' ) . PHP_EOL;
} catch ( Throwable $exception ) {
	fwrite( STDERR, $exception->getMessage() . PHP_EOL );
	exit( 1 );
}
