<?php
/**
 * Turgenev Core Functions
 * General core functions available on both the front-end and admin.
 *
 * @package Turgenev\Functions
 * @version 1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
  exit;
}

if ( ! function_exists( 'tg_doing_it_wrong' ) ) {
  /**
   * Wrapper for _doing_it_wrong().
   *
   * @param string $function Function used.
   * @param string $message Message to log.
   * @param string $version Version the message was added in.
   *
   * @since  1.0
   */
  function tg_doing_it_wrong( $function, $message, $version ) {
    // @codingStandardsIgnoreStart
    $message .= esc_html__( ' Backtrace: ', 'turgenev' ) . wp_debug_backtrace_summary();

    if ( is_ajax() || TG()->is_rest_api_request() ) {
      do_action( 'doing_it_wrong_run', $function, $message, $version );
      error_log( esc_html__( "{$function} was called incorrectly. {$message}. This message was added in version {$version}.", 'turgenev' ) );
    } else {
      _doing_it_wrong( $function, $message, $version );
    }
    // @codingStandardsIgnoreEnd
  }
}

if ( ! function_exists( 'is_ajax' ) ) {

  /**
   * Is_ajax - Returns true when the page is loaded via ajax.
   *
   * @return bool
   */
  function is_ajax() {
    return function_exists( 'wp_doing_ajax' ) ? wp_doing_ajax() : defined( 'DOING_AJAX' );
  }
}

if ( ! function_exists( 'tg_is_valid_apikey' ) ) {
  /**
   * Check if API key is valid
   *
   * @return bool
   */
  function tg_is_valid_apikey() {
    $option = get_option( 'turgenev' );

    return empty( $option['api_key_invalid'] );
  }
}

if ( ! function_exists( 'tg_is_gutenberg_active' ) ) {
  /**
   * Check if Gutenberg is active.
   * Must be used not earlier than plugins_loaded action fired.
   *
   * @return bool
   */
  function tg_is_gutenberg_active() {
    $gutenberg = false;
    $block_editor = false;

    if ( has_filter( 'replace_editor', 'gutenberg_init' ) ) {
      // Gutenberg is installed and activated.
      $gutenberg = true;
    }

    if ( version_compare( $GLOBALS['wp_version'], '5.0-beta', '>' ) ) {
      // Block editor.
      $block_editor = true;
    }

    if ( ! $gutenberg && ! $block_editor ) {
      return false;
    }

    include_once ABSPATH . 'wp-admin/includes/plugin.php';

    if ( ! is_plugin_active( 'classic-editor/classic-editor.php' ) ) {
      return true;
    }

    $use_block_editor = ( get_option( 'classic-editor-replace' ) === 'no-replace' );

    return $use_block_editor;
  }
}
