<?php
/**
 * Plugin Name: "Turgenev"
 * Description: Assesses the risk of falling under the "Baden-Baden" and shows what needs to be fixed
 * Version: 1.4
 * Author: al5dy
 * Plugin URI: https://turgenev.ashmanov.com/?a=home
 * Author URI: https://ziscod.com
 * License: GPLv3
 * License URI: https://www.gnu.org/licenses/gpl-3.0.html
 * Text Domain: turgenev
 * Domain Path: /languages/
 *
 * @package Turgenev
 */

defined( 'ABSPATH' ) || exit;

if ( ! defined( 'TGEV_PLUGIN_FILE' ) ) {
  define( 'TGEV_PLUGIN_FILE', __FILE__ );
}

// Include the main Turgenev class.
if ( ! class_exists( 'Turgenev', false ) ) {
  include_once dirname( TGEV_PLUGIN_FILE ) . '/includes/class-turgenev.php';
}

/**
 * Returns the main instance of TGEV.
 *
 * @since  1.0
 * @return Turgenev
 */
function TGEV() { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.FunctionNameInvalid
  return Turgenev::instance();
}

// Global for backwards compatibility.
$GLOBALS['turgenev'] = TGEV();
