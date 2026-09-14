<?php
/**
 * Read-only WordPress integration checks: wp eval-file tests/php/content-boundaries.php.
 * Exercises the real save/output filters without creating or changing a post.
 */

require_once dirname( __DIR__, 2 ) . '/src/Support/ContentProtection.php';
$protection = new Al5dy\Turgenev\Support\ContentProtection();
$protection->register();
$fixtures = array(
	array( '<p>Сло<strong>во</strong> &amp; 😀.</p>', '<p>Сло<strong>во</strong> &amp; 😀.</p>' ),
	array( '<p><span class="turgenev-highlight" data-turgenev-category="style">Текст</span> <em>статьи</em>.</p>', '<p>Текст <em>статьи</em>.</p>' ),
	array( '<span class="normal">Один <span class="turgenev-highlight">два <span>три</span></span></span>', '<span class="normal">Один два <span>три</span></span>' ),
);
$checks = 0;
foreach ( $fixtures as [ $input, $expected ] ) {
	foreach ( array( 'post', 'page', 'revision' ) as $type ) {
		$data = array( 'post_type' => $type, 'post_content' => $input, 'post_excerpt' => $input, 'post_content_filtered' => $input );
		$saved = wp_unslash( apply_filters( 'wp_insert_post_data', wp_slash( $data ), $data, $data, false ) );
		foreach ( array( 'post_content', 'post_excerpt', 'post_content_filtered' ) as $field ) {
			if ( $saved[ $field ] !== $expected ) { throw new RuntimeException( 'Save/revision filter changed formatting or retained service markup.' ); }
			++$checks;
		}
	}
	foreach ( array( 'the_content', 'the_excerpt', 'render_block' ) as $filter ) {
		$output = 'render_block' === $filter
			? render_block( array( 'blockName' => 'core/paragraph', 'attrs' => array(), 'innerBlocks' => array(), 'innerHTML' => $input, 'innerContent' => array( $input ) ) )
			: apply_filters( $filter, $input );
		if ( str_contains( $output, 'turgenev-highlight' ) || str_contains( $output, 'data-turgenev-' ) ) { throw new RuntimeException( 'Service markup reached a frontend filter.' ); }
		++$checks;
	}
}
$comment = '<!-- wp:example/text ' . serialize_block_attributes( array( 'content' => $fixtures[1][0] ) ) . ' /-->';
if ( str_contains( $protection->clean( $comment ), 'turgenev-highlight' ) ) { throw new RuntimeException( 'Service markup survived inside block attributes.' ); }
++ $checks;
echo 'WordPress save/frontend boundary checks passed: ' . $checks . PHP_EOL;
