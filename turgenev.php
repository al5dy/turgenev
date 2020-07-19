<?php
/**
 * Plugin Name: "Turgenev"
 * Description: Assesses the risk of falling under the "Baden-Baden" and shows what needs to be fixed
 * Version: 1.0
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

if ( ! defined( 'TG_PLUGIN_FILE' ) ) {
  define( 'TG_PLUGIN_FILE', __FILE__ );
}

// Include the main Turgenev class.
if ( ! class_exists( 'Turgenev', false ) ) {
  include_once dirname( TG_PLUGIN_FILE ) . '/includes/class-turgenev.php';
}

/**
 * Returns the main instance of TG.
 *
 * @since  1.0
 * @return Turgenev
 */
function TG() { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.FunctionNameInvalid
  return Turgenev::instance();
}

// Global for backwards compatibility.
$GLOBALS['turgenev'] = TG();
