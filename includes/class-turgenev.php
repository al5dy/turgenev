<?php
/**
 * Turgenev setup
 *
 * @package Turgenev
 * @since   1.0
 */

defined( 'ABSPATH' ) || exit;


/**
 * Main Turgenev Class.
 *
 * @class Turgenev
 */
final class Turgenev {

  /**
   * Turgenev version.
   *
   * @var string
   */
  public $version = '1.0';

  /**
   * The single instance of the class.
   *
   * @var Turgenev
   * @since 1.0
   */
  protected static $_instance = null;


  /**
   * Main Turgenev Instance.
   * Ensures only one instance of Turgenev is loaded or can be loaded.
   *
   * @return Turgenev - Main instance.
   * @see   \turgenev()
   * @since 1.0
   * @static
   */
  public static function instance() {
    if ( null === self::$_instance ) {
      self::$_instance = new self();
    }

    return self::$_instance;
  }

  /**
   * Cloning is forbidden.
   *
   * @since 1.0
   */
  public function __clone() {
    tg_doing_it_wrong( __FUNCTION__, __( 'Cloning is forbidden.', 'turgenev' ), '1.0' );
  }

  /**
   * Unserializing instances of this class is forbidden.
   *
   * @since 1.0
   */
  public function __wakeup() {
    tg_doing_it_wrong( __FUNCTION__, __( 'Unserializing instances of this class is forbidden.', 'turgenev' ), '1.0' );
  }

  /**
   * Turgenev Constructor.
   */
  public function __construct() {
    $this->define_constants();
    $this->includes();
    $this->init_hooks();
  }

  /**
   * When WP has loaded all plugins, trigger the `turgenev_loaded` hook.
   *
   * This ensures `turgenev_loaded` is called only after all other plugins
   * are loaded, to avoid issues caused by plugin directory naming changing
   * the load order.
   *
   * @since 1.0
   */
  public function on_plugins_loaded() {
    do_action( 'turgenev_loaded' );
  }



  /**
   * Include required core files used in admin and on the frontend.
   */
  public function includes() {
    include_once TG_ABSPATH . 'includes/tg-core-functions.php';

    if ( $this->is_request( 'admin' ) ) {
      include_once TG_ABSPATH . 'includes/class-tg-admin.php';
    }
  }


  /**
   * Hook into actions and filters.
   *
   * @since 1.0
   */
  private function init_hooks() {
    add_action( 'plugins_loaded', [ $this, 'on_plugins_loaded' ], -1 );
    add_action( 'init', [ $this, 'init' ], 0 );
    add_action( 'enqueue_block_editor_assets', [ $this, 'load_editor_assets' ] );
    add_action( 'admin_enqueue_scripts', [ $this, 'load_admin_assets' ] );
  }

  /**
   * Define Turgenev Constants.
   */
  private function define_constants() {
    $this->define( 'TG_ABSPATH', dirname( TG_PLUGIN_FILE ) . '/' );
    $this->define( 'TG_VERSION', $this->version );
    $this->define( 'TG_PLUGIN_BASENAME', plugin_basename( TG_PLUGIN_FILE ) );
  }

  /**
   * Define constant if not already set.
   *
   * @param string $name Constant name.
   * @param string|bool $value Constant value.
   */
  private function define( $name, $value ) {
    if ( ! defined( $name ) ) {
      define( $name, $value );
    }
  }


  /**
   * Returns true if the request is a non-legacy REST API request.
   * Legacy REST requests should still run some extra code for backwards compatibility.
   *
   * @todo: replace this function once core WP function is available: https://core.trac.wordpress.org/ticket/42061.
   * @return bool
   */
  public function is_rest_api_request() {
    if ( empty( $_SERVER['REQUEST_URI'] ) ) {
      return false;
    }

    $rest_prefix = trailingslashit( rest_get_url_prefix() );
    $is_rest_api_request = ( false !== strpos( $_SERVER['REQUEST_URI'], $rest_prefix ) ); // phpcs:disable WordPress.Security.ValidatedSanitizedInput.MissingUnslash, WordPress.Security.ValidatedSanitizedInput.InputNotSanitized

    return apply_filters( 'turgenev_is_rest_api_request', $is_rest_api_request );
  }


  /**
   * Load assets for classic editor
   */
  public function load_admin_assets($p) {
    $option = get_option( 'turgenev' );
    if ( tg_is_valid_apikey() && ! tg_is_gutenberg_active() ) {

      wp_register_script( 'turgenev-script', $this->plugin_url() . '/build/index_old.js', [ 'wp-blocks', 'wp-i18n' ] );
      wp_enqueue_script( 'turgenev-script' );

      // Localizes a registered script with data for a JavaScript variable
      wp_localize_script( 'turgenev-script', 'turgenev_ajax', [
        'url'     => admin_url( 'admin-ajax.php' ),
        'api_key' => $option['api_key']
      ] );

      wp_register_style( 'turgenev-style', $this->plugin_url() . '/build/index.css' );
      wp_enqueue_style( 'turgenev-style' );

      wp_set_script_translations( 'turgenev-script', 'turgenev', $this->plugin_path() . '/languages' );
    }
  }


  /**
   * Load assets for gutenberg editor
   */
  public function load_editor_assets() {
    $option = get_option( 'turgenev' );

    // Load assets only for valid API key
    if ( tg_is_valid_apikey() ) {
      $asset_file = include( $this->plugin_path() . '/build/index.asset.php' );

      wp_register_script( 'turgenev-script', $this->plugin_url() . '/build/index.js', $asset_file['dependencies'], $asset_file['version'] );
      wp_enqueue_script( 'turgenev-script' );

      // Localizes a registered script with data for a JavaScript variable
      wp_localize_script( 'turgenev-script', 'turgenev_ajax', [
        'url'     => admin_url( 'admin-ajax.php' ),
        'api_key' => $option['api_key']
      ] );

      wp_register_style( 'turgenev-style', $this->plugin_url() . '/build/index.css' );
      wp_enqueue_style( 'turgenev-style' );


      wp_set_script_translations( 'turgenev-script', 'turgenev', $this->plugin_path() . '/languages' );
    }

  }


  /**
   * Init Turgenev when WordPress Initialises.
   */
  public function init() {
    // Set up localisation.
    $this->load_plugin_textdomain();
  }


  /**
   * Get the plugin path.
   *
   * @return string
   */
  public function plugin_path() {
    return untrailingslashit( plugin_dir_path( TG_PLUGIN_FILE ) );
  }


  /**
   * Get the plugin url.
   *
   * @return string
   */
  public function plugin_url() {
    return untrailingslashit( plugins_url( '/', TG_PLUGIN_FILE ) );
  }

  /**
   * Load Localisation files.
   * Note: the first-loaded translation file overrides any following ones if the same translation is present.
   * Locales found in:
   *      - WP_LANG_DIR/turgenev/turgenev-LOCALE.mo
   *      - WP_LANG_DIR/plugins/turgenev-LOCALE.mo
   */
  public function load_plugin_textdomain() {
    $locale = is_admin() && function_exists( 'get_user_locale' ) ? get_user_locale() : get_locale();
    $locale = apply_filters( 'plugin_locale', $locale, 'turgenev' );

    unload_textdomain( 'turgenev' );
    load_textdomain( 'turgenev', WP_LANG_DIR . '/turgenev/turgenev-' . $locale . '.mo' );
    load_plugin_textdomain( 'turgenev', false, plugin_basename( dirname( TG_PLUGIN_FILE ) ) . '/languages' );
  }

  /**
   * What type of request is this?
   *
   * @param string $type admin, ajax, cron or frontend.
   *
   * @return bool
   */
  private function is_request( $type ) {
    switch ( $type ) {
      case 'admin':
        return is_admin();
      case 'ajax':
        return defined( 'DOING_AJAX' );
      case 'cron':
        return defined( 'DOING_CRON' );
      case 'frontend':
        return ( ! is_admin() || defined( 'DOING_AJAX' ) ) && ! defined( 'DOING_CRON' ) && ! $this->is_rest_api_request();
    }
  }

}
