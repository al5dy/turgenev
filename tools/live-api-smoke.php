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
		),
	)
);

$response = @file_get_contents( 'https://turgenev.ashmanov.com/', false, $context ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
if ( false === $response ) {
	fwrite( STDERR, "Turgenev API request failed.\n" );
	exit( 1 );
}

try {
	$data = json_decode( $response, true, 512, JSON_THROW_ON_ERROR );
} catch ( JsonException $exception ) {
	fwrite( STDERR, "Turgenev API returned malformed JSON.\n" );
	exit( 1 );
}

if ( isset( $data['error'] ) ) {
	fwrite( STDERR, 'Turgenev API error: ' . strip_tags( (string) $data['error'] ) . PHP_EOL );
	exit( 1 );
}

if ( ! isset( $data['balance'] ) || ! is_numeric( (string) $data['balance'] ) ) {
	fwrite( STDERR, "Balance field missing or invalid.\n" );
	exit( 1 );
}

echo 'Live API balance check OK. Balance: ' . $data['balance'] . " ₽\n";
