<?php
/**
 * Optional live balance check. Never prints the API key.
 */

$key = trim( (string) getenv( 'TURGENEV_API_KEY' ) );
if ( '' === $key ) {
	fwrite( STDERR, "Set TURGENEV_API_KEY to run the live smoke test.\n" );
	exit( 2 );
}

$body = http_build_query( array( 'api' => 'balance', 'key' => $key ), '', '&', PHP_QUERY_RFC3986 );
$context = stream_context_create(
	array(
		'http' => array(
			'method'        => 'POST',
			'header'        => "Content-Type: application/x-www-form-urlencoded\r\nAccept: application/json\r\n",
			'content'       => $body,
			'timeout'       => 20,
			'ignore_errors' => true,
			'follow_location' => 0,
			'max_redirects' => 0,
		),
	)
);

$response = @file_get_contents( 'https://turgenev.ashmanov.com/', false, $context, 0, 1048577 ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
if ( false === $response ) {
	fwrite( STDERR, "Turgenev API request failed.\n" );
	exit( 1 );
}
if ( strlen( $response ) > 1048576 || ! preg_match( '~^HTTP/\S+\s+2\d\d\b~', $http_response_header[0] ?? '' ) ) {
	fwrite( STDERR, "Turgenev API returned an unsuccessful or oversized response.\n" );
	exit( 1 );
}

try {
	$data = json_decode( $response, true, 512, JSON_THROW_ON_ERROR );
} catch ( JsonException $exception ) {
	fwrite( STDERR, "Turgenev API returned malformed JSON.\n" );
	exit( 1 );
}

if ( ! is_array( $data ) || array_key_exists( 'error', $data ) ) {
	fwrite( STDERR, "Turgenev rejected the request. Check the API key and account status.\n" );
	exit( 1 );
}

if ( ! isset( $data['balance'] ) || ! is_scalar( $data['balance'] ) || ! preg_match( '/^-?\d{1,12}(?:\.\d{1,8})?$/D', (string) $data['balance'] ) ) {
	fwrite( STDERR, "Balance field missing or invalid.\n" );
	exit( 1 );
}

echo 'Live API balance check OK. Balance: ' . $data['balance'] . " ₽\n";
