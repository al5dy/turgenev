<?php
/**
 * Uninstall Turgenev.
 *
 * @package Turgenev
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'turgenev' );
