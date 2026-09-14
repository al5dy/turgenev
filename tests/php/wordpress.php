<?php
/**
 * Real WordPress persistence regression. Run with wp eval-file on a disposable test site.
 * Creates only its own test drafts/revisions and removes them in finally.
 */

require_once dirname( __DIR__, 2 ) . '/src/Support/ContentProtection.php';
require_once ABSPATH . 'wp-admin/includes/post.php';
$protection = new Al5dy\Turgenev\Support\ContentProtection();
$protection->register();
$checks = 0;
$created = array();
$previous_user = get_current_user_id();
$admins = get_users( array( 'role' => 'administrator', 'fields' => 'ID', 'number' => 1 ) );
if ( ! $admins ) { throw new RuntimeException( 'A test administrator is required.' ); }
wp_set_current_user( (int) $admins[0] );
$assert = static function ( bool $valid, string $message ) use ( &$checks ): void {
	++$checks;
	if ( ! $valid ) { throw new RuntimeException( $message ); }
};
$marked = '<p>Это <strong><span class="turgenev-highlight" data-turgenev-category="style" data-turgenev-level="2">текст</span></strong> <a href="https://example.test/?x=1&amp;y=2">ссылка</a>.</p>';
$clean = '<p>Это <strong>текст</strong> <a href="https://example.test/?x=1&amp;y=2">ссылка</a>.</p>';
try {
	$assert( $protection->clean( $marked ) === $clean, 'Legacy cleanup changed non-plugin formatting.' );
	$assert( $protection->clean( '<span class="normal">a<span class="turgenev-highlight">b<span>c</span></span>d</span>' ) === '<span class="normal">ab<span>c</span>d</span>', 'Nested span cleanup failed.' );
	$assert( $protection->clean( '<SPAN title="x > y" class=\'turgenev-highlight\'>😀</SPAN>' ) === '😀', 'Quoted attributes/case handling failed.' );
	$comment = '<!-- wp:example/text ' . serialize_block_attributes( array( 'content' => $marked ) ) . ' /-->';
	$assert( ! str_contains( $protection->clean( $comment ), 'turgenev-highlight' ), 'Service markup survived in serialized block attributes.' );
	$unchanged = '<!-- wp:paragraph {"className":"custom"} -->' . $clean . '<!-- /wp:paragraph -->';
	$assert( $protection->clean( $unchanged ) === $unchanged, 'Unannotated block content must remain byte-identical.' );
	register_post_type( 'turgenev_smoke', array( 'public' => false, 'show_ui' => true, 'show_in_rest' => true, 'supports' => array( 'editor', 'revisions' ) ) );
	foreach ( array( 'post', 'page', 'turgenev_smoke' ) as $type ) {
		$id = wp_insert_post( wp_slash( array( 'post_type' => $type, 'post_status' => 'draft', 'post_title' => 'Turgenev isolated persistence test', 'post_content' => $marked ) ), true );
		if ( is_wp_error( $id ) ) { throw new RuntimeException( 'Could not create test draft.' ); }
		$created[] = $id;
		$assert( get_post( $id )->post_content === $clean, $type . ': save retained service markup.' );
		wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $marked . '<p>Second version.</p>' ) ) );
		$revision = _wp_put_post_revision( get_post( $id ) );
		$assert( is_int( $revision ) && $revision > 0 && ! str_contains( get_post( $revision )->post_content, 'turgenev-highlight' ), $type . ': revision retained service markup.' );
		$autosave = wp_create_post_autosave( array( 'post_ID' => $id, 'post_content' => wp_slash( $marked . '<p>Autosave.</p>' ), 'post_title' => 'Turgenev autosave fixture', 'post_type' => $type ) );
		if ( is_wp_error( $autosave ) ) { throw new RuntimeException( 'Autosave fixture failed: ' . $autosave->get_error_code() ); }
		$assert( is_int( $autosave ) && $autosave > 0 && ! str_contains( get_post( $autosave )->post_content, 'turgenev-highlight' ), $type . ': autosave retained service markup.' );
		$assert( ! str_contains( apply_filters( 'the_content', $marked ), 'turgenev-highlight' ), $type . ': frontend retained legacy markup.' );
	}
	echo 'WordPress save/revision/autosave/frontend tests passed: ' . $checks . PHP_EOL;
} finally {
	foreach ( $created as $id ) { wp_delete_post( $id, true ); }
	unregister_post_type( 'turgenev_smoke' );
	wp_set_current_user( $previous_user );
	echo 'Removed only the test drafts and their revisions/autosaves.' . PHP_EOL;
}
