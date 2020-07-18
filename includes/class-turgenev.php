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
   * Restricts the cloning of an object
   */
  private function __clone() {
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
   * Include required core files used in admin and on the frontend.
   */
  public function includes() {

    if ( is_admin() ) {
      include_once TG_ABSPATH . 'includes/class-tg-admin.php';
    }
  }


  /**
   * Hook into actions and filters.
   *
   * @since 1.0
   */
  private function init_hooks() {
    add_action( 'init', [ $this, 'init' ], 0 );
    add_action( 'enqueue_block_editor_assets', [ $this, 'load_editor_assets' ] );
    add_action( 'admin_enqueue_scripts', [ $this, 'load_admin_assets' ] );

   // add_action( 'init', [$this, 'myguten_set_script_translations'] );
  }

  public function myguten_set_script_translations() {
    //wp_set_script_translations( 'myguten-script', 'myguten', plugin_dir_path( __FILE__ ) . 'languages' );
    var_dump(wp_set_script_translations( 'turgenev-script', 'turgenev', $this->plugin_path() . '/languages' ));
  }

  /**
   * Define Turgenev Constants.
   */
  private function define_constants() {
    // Main Constants
    if ( ! defined( 'TG_ABSPATH' ) ) {
      define( 'TG_ABSPATH', dirname( TG_PLUGIN_FILE ) . '/' );
    }
    if ( ! defined( 'TG_VERSION' ) ) {
      define( 'TG_VERSION', $this->version );
    }
    if ( ! defined( 'TG_PLUGIN_BASENAME' ) ) {
      define( 'TG_PLUGIN_BASENAME', plugin_basename( TG_PLUGIN_FILE ) );
    }
  }


  public function is_valid_apikey() {
    $option = get_option( 'turgenev' );

    return empty( $option['api_key_invalid'] );
  }

  /**
   * Check if Gutenberg is active.
   * Must be used not earlier than plugins_loaded action fired.
   *
   * @return bool
   */
  public function is_gutenberg_active() {
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


  public function load_admin_assets() {
    $option = get_option( 'turgenev' );
    if ( $this->is_valid_apikey() && ! $this->is_gutenberg_active() ) {

      wp_register_script( 'turgenev-script', $this->plugin_url() . '/build/index_old.js' );
      wp_enqueue_script( 'turgenev-script' );

      // Localizes a registered script with data for a JavaScript variable
      $localize_params = [
        'url'     => admin_url( 'admin-ajax.php' ),
        'api_key' => $option['api_key']
      ];

      wp_localize_script( 'turgenev-script', 'turgenev_ajax', $localize_params );

      wp_register_style( 'turgenev-style', $this->plugin_url() . '/build/index.css' );
      wp_enqueue_style( 'turgenev-style' );
    }
  }


  public function load_editor_assets() {
    $option = get_option( 'turgenev' );

    if ( $this->is_valid_apikey() ) {
      $asset_file = include( $this->plugin_path() . '/build/index.asset.php' );

      wp_register_script( 'turgenev-script', $this->plugin_url() . '/build/index.js', $asset_file['dependencies'], $asset_file['version'] );
      wp_enqueue_script( 'turgenev-script' );

      // Localizes a registered script with data for a JavaScript variable
      $localize_params = [
        'url'     => admin_url( 'admin-ajax.php' ),
        'api_key' => $option['api_key']
      ];


      wp_localize_script( 'turgenev-script', 'turgenev_ajax', $localize_params );

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

}
